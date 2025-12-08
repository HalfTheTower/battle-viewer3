import { useState, useEffect, useRef, useCallback } from "react";
import { parseNumber, formatNumber } from "./parser";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, LabelList
} from "recharts";

import {
  collection, addDoc, getDocs, doc, deleteDoc, updateDoc,
  query, orderBy, limit, getDoc, setDoc, startAfter
} from "firebase/firestore";
import { db } from "./firebase";

/* ===================== 상수 ===================== */
const KILLED_BY_COLORS = {
  Basic: "#ff4d4d",       // 빨강
  Fast: "#ffd84d",        // 노랑
  Tank: "#ff9f1a",        // 주황
  Ranged: "#4deeea",      // 하늘
  Boss: "#c77dff",        // 보라
  Protector: "#4dff88",  // 초록
  Vampire: "#ff5c5c",    // 빨강 삼각
  Scatter: "#a29bfe",    // 연보라
  Ray: "#ffe066",        // 노랑 삼각
  Saboteur: "#ff6b6b",   // 빨강 오각
  Commander: "#ffa94d",  // 주황 오각
  Overcharge: "#7aa2ff", // 파랑 오각
};

const KILLED_BY_SHAPES = {
  Basic: "square",
  Fast: "square",
  Tank: "square",
  Ranged: "square",
  Boss: "square",
  Protector: "square",
  Vampire: "triangle",
  Scatter: "triangle",
  Ray: "triangle",
  Saboteur: "pentagon",
  Commander: "pentagon",
  Overcharge: "pentagon"
};


const TAB_COLORS = {
  전체: "#8884d8",
  파밍: "#36a2eb",
  토너: "#ff6384",
  등반: "#4bc0c0",
  리롤: "#ffcd56",
};

const SHORT_NAMES = {
  orb: '오브',
  chainlightning: '체라',
  blackhole: '블홀',
  electrons: '전자',
  projectiles: '투사체',
  deathray: '죽광',
  innerlandmine: '지뢰플',
  swamp:'독늪',
  smartmissile:'스미',
};

const IGNORE_LIST = [
  "damage taken","damage taken wall","damage taken while berserked",
  "damage gain from berserk","death defy","lifesteal","projectiles count",
  "enemies hit by orbs","land mines spawned","tagged by deathwave"
];

const PAGE_SIZE = 10;

/* ===================== 유틸 ===================== */

const parseBattleDate = (raw) => {
  const match = raw.match(/Battle Date\s+([A-Za-z]{3}) (\d{2}), (\d{4}) (\d{2}:\d{2})/);
  if (!match) return new Date(0);
  const months = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
                   Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
  const [, mon, day, year, time] = match;
  return new Date(`${year}-${months[mon]}-${day}T${time}:00`);
};

const formatBattleDate = (raw) => {
  const match = raw.match(/Battle Date\s+([A-Za-z]{3}) (\d{2}), (\d{4}) (\d{2}:\d{2})/);
  if (!match) return null;
  const months = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
                   Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
  const [, mon, day, year, time] = match;
  return `${year}-${months[mon]}-${day} ${time}`;
};

const extractTime = (line) => {
  let h=0,m=0,s=0;
  if (!line) return {h,m,s};
  const hMatch = line.match(/(\d+)h/),
        mMatch = line.match(/(\d+)m/),
        sMatch = line.match(/(\d+)s/);
  return {h:hMatch?+hMatch[1]:0, m:mMatch?+mMatch[1]:0, s:sMatch?+sMatch[1]:0};
};

const formatTime = (seconds) => {
  const h = Math.floor(seconds/3600),
        m = Math.floor((seconds%3600)/60),
        s = seconds%60;
  return `${h}h ${m}m ${s}s`;
};

/* ===================== 메인 ===================== */

export default function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState([]);
  const [savedList, setSavedList] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [activeTab, setActiveTab] = useState("배틀리포트");
  const [filterType, setFilterType] = useState("전체");
  const [modalVisible, setModalVisible] = useState(false);
  const [dailyStatList, setDailyStatList] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [dayRange, setDayRange] = useState(30); // 7 | 30 | "all"


  const modalRef = useRef(null);
  const lastVisibleRef = useRef(null);
  const observerRef = useRef(null);

  const renderKillShape = (type, color) => {
  const shape = KILLED_BY_SHAPES[type] || "square";

  const baseStyle = {
    width: 10,
    height: 10,
    background: color,
    display: "inline-block",
  };

  if (shape === "circle") {
    return <span style={{ ...baseStyle, borderRadius: "50%" }} />;
  }

  if (shape === "triangle") {
    return (
      <span
        style={{
          width: 0,
          height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderBottom: `10px solid ${color}`,
        }}
      />
    );
  }

  if (shape === "pentagon") {
    return (
      <span
        style={{
          width: 10,
          height: 10,
          background: color,
          clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
        }}
      />
    );
  }

  if (shape === "hexagon") {
    return (
      <span
        style={{
          width: 10,
          height: 10,
          background: color,
          clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
        }}
      />
    );
  }

  // 기본 사각형
  return <span style={{ ...baseStyle, borderRadius: 2 }} />;
};


  const rebuildDailyStats = async () => {
  if (!confirm("⚠️ 기존 모든 리포트를 날짜별 통계로 재집계할까? (1회 실행용)")) return;

  console.log("🔁 날짜별 통계 재집계 시작...");

  const snap = await getDocs(collection(db, "reports"));

  const stats = {};

  snap.docs.forEach(d => {
    const item = d.data();

    if (!item.raw) return;

    const formatted = formatBattleDate(item.raw);
    if (!formatted) return;

    const date = formatted.split(" ")[0];

    const timeLine = item.raw.split("\n").find(l => l.includes("Real Time"));
    const { h, m, s } = extractTime(timeLine);
    const seconds = h * 3600 + m * 60 + s;

    const coinsLine = item.raw.split("\n").find(l => l.includes("Coins earned"));
    const coins = parseNumber(
      coinsLine?.split("\t")[1] ||
      coinsLine?.split(":")[1] ||
      "0"
    );

    if (!stats[date]) {
      stats[date] = { totalCoins: 0, totalSeconds: 0 };
    }

    stats[date].totalCoins += coins;
    stats[date].totalSeconds += seconds;
  });

  for (const date of Object.keys(stats)) {
    await setDoc(doc(db, "dailyStats", date), stats[date]);
    console.log(`✅ ${date} 통계 저장 완료`, stats[date]);
  }

  alert("✅ 기존 데이터 날짜별 통계 재작성 완료!");
  loadDailyStats();
};


/* ===================== 요약 ===================== */

const extractSummary = (raw) => {
  const tier = raw.match(/Tier\s+(\d+)/)?.[1] + "T" || "-";
  const waveNum = raw.match(/Wave\s+(\d+)/)?.[1] || "-";
  const wave = waveNum.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "W";

  // ✅ Real Time 없을 때도 대비
  const timeLine = raw.split("\n").find(l => l.includes("Real Time")) || "";
  const { h, m, s } = extractTime(timeLine);
  const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  // ✅ Coins earned 0 / 아예 없을 때 모두 대비
  const coinsLine = raw.split("\n").find(l => l.includes("Coins earned"));
  const coinsRaw =
    coinsLine?.split("\t")[1]?.trim() ||
    coinsLine?.split(":")[1]?.trim() ||
    "0";

  const coinsFormatted = formatNumber(coinsRaw);

  // ✅ Coins per hour 없을 경우 undefined 방지
  const cphMatch = raw.match(/Coins per hour\s+([\d.]+\w+)/);
  const cph = cphMatch ? cphMatch[1] + "/h" : "-";

// ✅ Killed By 완전 안전 추출 (빈 값 + Coins earned 오염 완전 차단)
let killedBy = "";
const killedLine = raw.split("\n").find(l => l.startsWith("Killed By"));

if (killedLine) {
  const value = killedLine.split("\t")[1]?.trim(); // ✅ 탭 오른쪽 값만 사용
  if (value && value !== "0") {
    killedBy = value;
  }
}

  const lines = raw.split("\n");
  const totalDamageLine = lines.find(l => l.toLowerCase().startsWith("damage dealt"));
  const totalDamage = totalDamageLine
    ? parseNumber(totalDamageLine.split("\t")[1]?.trim() || totalDamageLine.split(":")[1]?.trim())
    : 0;

  const damages = lines
    .filter(l => l.toLowerCase().includes("damage") && !l.toLowerCase().startsWith("damage dealt"))
    .map(l => {
      const nameRaw = (l.split("\t")[0] || l.split(":")[0]).trim();
      if (IGNORE_LIST.some(ig => nameRaw.toLowerCase().includes(ig))) return null;

      const num = parseNumber(l.split("\t")[1]?.trim() || l.split(":")[1]?.trim() || "0");
      const pct = totalDamage ? (num / totalDamage * 100) : 0;
      if (pct < 1) return null;

      const normalized = nameRaw.toLowerCase().replace(/\s+/g, '').replace('damage', '');
      return `${SHORT_NAMES[normalized] || nameRaw}: ${pct.toFixed(0)}%`;
    })
    .filter(Boolean)
    .sort((a, b) => parseInt(b.split(":")[1]) - parseInt(a.split(":")[1]));

  return (
    <>
      {/* ✅ Killed By 값이 있을 때만 표시 */}
<div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
  <span>{tier} {wave}</span>

{killedBy && (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "3px 9px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      color: "#333",
      background: (KILLED_BY_COLORS[killedBy] || "#ffd6d6") + "66",
      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      border: "1px solid rgba(0,0,0,0.15)"
    }}
  >
    {renderKillShape(
      killedBy,
      KILLED_BY_COLORS[killedBy] || "#c94f4f"
    )}
    Killed By {killedBy || "Unknown"}
  </span>
)}

</div>





      <div>
        ({coinsFormatted} / {timeStr}) ▶ {cph}
      </div>

      {damages.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {damages.map((d, i) => (
            <span
              key={i}
              style={{
                background: Object.values(TAB_COLORS)[i % 5],
                color: '#fff',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 12,
                fontWeight: 600
              }}
            >
              {d}
            </span>
          ))}
        </div>
      )}
    </>
  );
};



/* ===================== 파이차트 ===================== */

const analyzeReport = (rawInput) => {
  const lines = rawInput.split("\n");
  const totalDamageLine = lines.find(l=>l.toLowerCase().startsWith("damage dealt"));
  const totalDamage = totalDamageLine ? parseNumber(totalDamageLine.split("\t")[1]?.trim() || totalDamageLine.split(":")[1]?.trim()) : 0;
  if (!totalDamage) return [];

  return lines
    .filter(l=>l.toLowerCase().includes("damage") && !l.toLowerCase().startsWith("damage dealt"))
    .map(l=>{
      const nameRaw = (l.split("\t")[0] || l.split(":")[0]).trim().toLowerCase();
      if (IGNORE_LIST.some(ig=>nameRaw.includes(ig))) return null;
      const num = parseNumber(l.split("\t")[1]?.trim() || l.split(":")[1]?.trim() || "0");
      const pct = (num/totalDamage)*100;
      if (pct<1) return null;
      const normalized = nameRaw.replace(/\s+/g, '').replace('damage', '');
      return { name: SHORT_NAMES[normalized] || nameRaw, percent: pct };
    })
    .filter(Boolean)
    .sort((a,b)=>b.percent-a.percent);
};

/* ===================== 저장 ===================== */

const saveReport = async () => {
  if (!input.trim()) return alert("입력값 없어!");
  const formatted = formatBattleDate(input);
  if (!formatted) return alert("날짜 파싱 실패");

  const date = formatted.split(" ")[0];
  const timeLine = input.split("\n").find(l => l.includes("Real Time"));
  const {h,m,s} = extractTime(timeLine);
  const seconds = h*3600 + m*60 + s;

  const coinsLine = input.split("\n").find(l=>l.includes("Coins earned"));
  const coins = parseNumber(coinsLine?.split("\t")[1] || coinsLine?.split(":")[1] || "0");

  await addDoc(collection(db,"reports"), {
    raw: input,
    timestamp: Date.now(),
    type: "전체",
    memo: "",
    meta: { date, coins, seconds }
  });

  const statRef = doc(db,"dailyStats",date);
  const statSnap = await getDoc(statRef);
  if (statSnap.exists()) {
    const prev = statSnap.data();
    await updateDoc(statRef,{
      totalCoins: prev.totalCoins + coins,
      totalSeconds: prev.totalSeconds + seconds
    });
  } else {
    await setDoc(statRef,{
      totalCoins: coins,
      totalSeconds: seconds
    });
  }

  setInput("");
  loadSavedList(false);
};

/* ===================== 무한 스크롤 ===================== */

const loadSavedList = async (isMore = false) => {
  if (!hasMore && isMore) {
    console.log("✅ 더 이상 불러올 데이터 없음");
    return;
  }

  let q;

  if (isMore && lastVisibleRef.current) {
    console.log("📡 추가 로딩 요청 (다음 페이지)");

    q = query(
      collection(db,"reports"),
      orderBy("timestamp","desc"),
      startAfter(lastVisibleRef.current),
      limit(PAGE_SIZE)
    );
  } else {
    console.log("📡 최초 로딩 요청");

    q = query(
      collection(db,"reports"),
      orderBy("timestamp","desc"),
      limit(PAGE_SIZE)
    );

    lastVisibleRef.current = null;
    setHasMore(true);
  }

  const snap = await getDocs(q);

  console.log(`📥 이번에 Firestore에서 읽은 문서 수: ${snap.size}`);

  if (snap.empty) {
    console.log("⛔ 더 이상 데이터 없음 (끝)");
    setHasMore(false);
    return;
  }

  lastVisibleRef.current = snap.docs[snap.docs.length - 1];

  const newData = snap.docs.map((d,i)=>({
    id:d.id,
    ...d.data(),
    number: isMore ? savedList.length + i + 1 : i + 1
  }));

  setSavedList(prev =>
    isMore ? [...prev, ...newData] : newData
  );

  // ✅ 누적 로드량 & 예상 비용 로그
  const totalLoaded = (isMore ? savedList.length : 0) + snap.size;
  const estimatedCost = (totalLoaded * 0.06 / 100000).toFixed(6);

  console.log(`📊 현재까지 누적 로드 문서 수: ${totalLoaded}`);
  console.log(`💰 Firestore 읽기 예상 비용(USD): $${estimatedCost}`);
};


/* ✅ 자동 스크롤 감지 */

const lastItemRef = useCallback((node) => {
  if (!hasMore) return;

  if (observerRef.current) observerRef.current.disconnect();

  observerRef.current = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      loadSavedList(true);
    }
  });

  if (node) observerRef.current.observe(node);
}, [hasMore, loadSavedList]);

/* ===================== dailyStats ===================== */
const loadDailyStats = async () => {
  console.log(`📊 날짜별 통계 로딩 (${dayRange === "all" ? "전체" : dayRange + "일"})`);

  let q;

  if (dayRange === "all") {
    q = query(
      collection(db,"dailyStats"),
      orderBy("__name__","desc")
    );
  } else {
    q = query(
      collection(db,"dailyStats"),
      orderBy("__name__","desc"),
      limit(dayRange)
    );
  }

  const snap = await getDocs(q);

  console.log(`📥 날짜별 통계 읽은 문서 수: ${snap.size}`);

  setDailyStatList(
    snap.docs.map(d => ({ date: d.id, ...d.data() }))
  );

  const estimatedCost = (snap.size * 0.06 / 100000).toFixed(6);
  console.log(`💰 날짜별 통계 예상 Firestore 읽기 비용(USD): $${estimatedCost}`);
};


useEffect(()=>{ loadSavedList(false); },[]);
useEffect(()=>{
  if(activeTab==="날짜별통계") loadDailyStats();
},[activeTab, dayRange]);

/* ===================== UI ===================== */

return (
  <div style={{padding:20,maxWidth:900,margin:"0 auto"}}>
    <h1 style={{textAlign:"center",marginBottom:16}}>Battle Report</h1>

    <div style={{display:"flex",gap:8,marginBottom:12}}>
      {["배틀리포트","날짜별통계"].map(t=>(
        <button
          key={t}
          onClick={()=>setActiveTab(t)}
          style={{
            flex:1,
            padding:10,
            borderRadius:8,
            border:"none",
            background:activeTab===t?"#0077b6":"#eee",
            color:activeTab===t?"white":"#333",
            fontWeight:600
          }}
        >
          {t}
        </button>
      ))}
    </div>

{/* ===================== 배틀리포트 ===================== */}

{activeTab==="배틀리포트" && (
  <>
    <textarea
      value={input}
      onChange={e=>setInput(e.target.value)}
      placeholder="Battle Report 붙여넣기"
      style={{width:'100%',height:100,padding:10,borderRadius:10}}
    />

    <div style={{display:'flex',gap:10,marginTop:10}}>
      <button onClick={()=>setResult(analyzeReport(input))}>분석</button>
      <button onClick={saveReport}
        style={{background:'#4CAF50',color:'white',fontWeight:700}}>
        저장
      </button>
    </div>

    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:12}}>
      {Object.keys(TAB_COLORS).map(tab=>(
        <button key={tab}
          onClick={()=>setFilterType(tab)}
          style={{
            padding:'6px 12px',
            border:'none',
            borderRadius:6,
            background:filterType===tab?TAB_COLORS[tab]:TAB_COLORS[tab]+'55',
            color:'white',
            fontWeight:700
          }}>
          {tab}
        </button>
      ))}
    </div>

    <div style={{marginTop:16}}>
      {savedList
        .filter(r=>filterType==="전체"||r.type===filterType)
        .map((item, idx, arr)=>(
        <div
          key={item.id}
          ref={idx === arr.length - 1 ? lastItemRef : null}
          onClick={()=>{
            setSelectedReport(item);
            setResult(analyzeReport(item.raw));
            setModalVisible(true);
          }}
          style={{
            padding:12,
            borderRadius:10,
            background:TAB_COLORS[item.type]+'22',
            marginBottom:10,
            cursor:'pointer'
          }}
        >
          <div style={{fontWeight:700}}>
            [{item.number}] {formatBattleDate(item.raw)}
          </div>
          <div style={{marginTop:6}}>
            {extractSummary(item.raw)}
          </div>
          {item.memo && (
  <div
    style={{
      marginTop: 6,
      padding: "6px 8px",
      background: "rgba(255, 255, 255, 0.95)",
      borderRadius: 6,
      fontSize: 13,
      color: "#686868e5",
      fontStyle: "italic",
      whiteSpace: "pre-wrap",
    }}
  >
{item.memo.length > 200 ? item.memo.slice(0, 200) + "..." : item.memo}
  </div>
)}

        </div>
      ))}
    </div>
  </>
)}

{/* ===================== 날짜별통계 ===================== */}

{activeTab==="날짜별통계" && (
  
  <>
  <div style={{display:"flex", gap:8, marginBottom:12}}>
  {[7, 30, "all"].map(v => (
    <button
      key={v}
      onClick={() => setDayRange(v)}
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        border: "none",
        fontWeight: 700,
        background: dayRange === v ? "#0077b6" : "#ddd",
        color: dayRange === v ? "white" : "#333",
        cursor: "pointer"
      }}
    >
      {v === "all" ? "전체" : `최근 ${v}일`}
    </button>
  ))}
</div>

  <button
  onClick={rebuildDailyStats}
  style={{
    marginBottom: 12,
    padding: "8px 12px",
    borderRadius: 8,
    fontWeight: 700,
    background: "#ff9800",
    color: "white",
    border: "none",
    cursor: "pointer"
  }}
>
  🔁 기존 데이터 통계 재생성 (1회)
</button>

{dailyStatList.map(stat => {
  const fullPercent = Math.min((stat.totalSeconds / 86400) * 100, 100);
  const wastePercent = Math.max(0, 100 - fullPercent);

  return (
    <div
      key={stat.date}
      style={{
        padding: 14,
        marginBottom: 14,
        borderRadius: 10,
        background: "#f7f7f7",
        boxShadow: "0 2px 6px rgba(0,0,0,0.08)"
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16 }}>
        {stat.date}
      </div>

      <div style={{ marginTop: 6 }}>
        Coins: <b>{formatNumber(stat.totalCoins)}</b>
      </div>

      <div>
        Real Time: <b>{formatTime(stat.totalSeconds)}</b>
      </div>

      {/* ✅ 진행률 막대 그래프 */}
      <div style={{ marginTop: 8 }}>
        <ResponsiveContainer width="100%" height={20}>
          <BarChart
            data={[{ name: "전체", value: fullPercent }]}
            layout="vertical"
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="name" hide />
            <Bar
              dataKey="value"
              fill="#0077b6"
              isAnimationActive={false}
              background={{ fill: "#ddd" }}
            >
              <LabelList
                dataKey="value"
                position="insideRight"
                formatter={(v) => v.toFixed(2) + "%"}
                fill="#fff"
                fontSize={12}
                fontWeight={600}
                offset={5}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: 8 }}>
        낭비 시간: <b>{wastePercent.toFixed(2)}%</b>
      </div>
    </div>
  );
})}

  </>
)}

{/* ===================== 모달 ===================== */}

{modalVisible && selectedReport && (
  <div
    onClick={(e)=>{
      if(modalRef.current && !modalRef.current.contains(e.target)){
        setModalVisible(false);
        setSelectedReport(null);
        setResult([]);
      }
    }}
    style={{
      position:'fixed',
      top:0,left:0,
      width:'100%',height:'100%',
      background:'rgba(0,0,0,0.5)',
      display:'flex',
      justifyContent:'center',
      alignItems:'center',
      zIndex:1000
    }}
  >
    <div ref={modalRef}
      style={{
        background:'white',
        padding:20,
        borderRadius:10,
        width:'85%',
        maxWidth:520,
        maxHeight:'80%',
        overflowY:'auto'
      }}>



      <h2>전투 리포트</h2>

      <textarea
        value={selectedReport.raw}
        readOnly
        style={{width:'100%',height:140,marginTop:10}}
      />

      <textarea
        value={selectedReport.memo || ""}
        onChange={e=>setSelectedReport(
          prev=>({...prev, memo:e.target.value})
        )}
        placeholder="메모 수정"
        style={{
          width:'100%',
          height:80,
          marginTop:10,
          padding:10
        }}
      />

      <div style={{display:'flex',gap:10,marginTop:12}}>
        <select
          value={selectedReport.type}
          onChange={async e=>{
            const newType = e.target.value;
            await updateDoc(doc(db,"reports",selectedReport.id),{ type:newType });
            setSelectedReport(prev=>({...prev,type:newType}));
            loadSavedList(false);
          }}
        >
          {Object.keys(TAB_COLORS).map(tab=>(
            <option key={tab} value={tab}>{tab}</option>
          ))}
        </select>

        <button
          onClick={async ()=>{
            if(!confirm("삭제할까?")) return;
            await deleteDoc(doc(db,"reports",selectedReport.id));
            setModalVisible(false);
            loadSavedList(false);
          }}
          style={{background:'#ff4444',color:'white'}}
        >
          삭제
        </button>

        <button
          onClick={async ()=>{
            await updateDoc(doc(db,"reports",selectedReport.id),{
              memo:selectedReport.memo || ""
            });
            alert("메모 저장됨");
          }}
          style={{background:'#4CAF50',color:'white'}}
        >
          메모 저장
        </button>
      </div>
    </div>
  </div>
)}

  </div>
);
}
