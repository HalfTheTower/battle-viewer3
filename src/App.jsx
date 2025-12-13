// App.jsx
import { useState, useEffect, useRef, useCallback } from "react";

import {
  TAB_COLORS,
  IGNORE_LIST,
  SHORT_NAMES,
  PAGE_SIZE,
  KILLED_BY_COLORS,
  KILLED_BY_SHAPES,
  KILLED_BY_LABELS,
  DAMAGE_COLORS,
  UNIT_LEVEL
} from "./battleConstants";

import { parseNumber, formatNumber } from "./parser";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  getDoc,
  setDoc,
  startAfter,
  where,
  increment,
} from "firebase/firestore";

import { db } from "./firebase";

// 컴포넌트 분리본
import BattleReportInput from "./components/BattleReportInput";
import BattleReportViewer from "./components/BattleReportViewer";
import DailyStatsViewer from "./components/DailyStatsViewer";

/* ==========================================================
                      유틸(기존 그대로)
   ========================================================== */

// ⛔ "630.81K" 같은 문자열 안전하게 숫자로 변환
const parseStat = (line) => {
  if (!line) return 0;
  // 예: "Cells Earned\t630.81K" 에서 630.81K만 뽑기
  const match = line.match(/([\d.,]+[a-zA-Z]*)/);
  return parseNumber(match ? match[1] : "0");
};


// 배경색(hex)에 따라 글자색 자동 선택 (가독성)
const getTextColor = (hex) => {
  if (!hex) return "#fff";

  hex = hex.replace("#", "");

  // RGB 분리
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // 밝기 계산 (Perceived luminance)
  const luminance = (0.299*r + 0.587*g + 0.114*b);

  // 밝으면 검정, 어두우면 흰색
  return luminance > 150 ? "#000" : "#fff";
};


const formatBattleDate = (raw) => {
  const match = raw.match(
    /Battle Date\s+([A-Za-z]{3}) (\d{2}), (\d{4}) (\d{2}:\d{2})/
  );
  if (!match) return "";

  const months = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12"
  };

  const [, mon, day, year, time] = match;
  const yy = year.slice(2);

  return `${yy}-${months[mon]}-${day} ${time}`;
};


const extractTime = (line) => {
  let h = 0,
    m = 0,
    s = 0;
  if (!line) return { h, m, s };

  const hMatch = line.match(/(\d+)h/);
  const mMatch = line.match(/(\d+)m/);
  const sMatch = line.match(/(\d+)s/);

  return {
    h: hMatch ? +hMatch[1] : 0,
    m: mMatch ? +mMatch[1] : 0,
    s: sMatch ? +sMatch[1] : 0
  };
};

const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return `${h}h ${m}m ${s}s`;
};

const extractTierWave = (raw) => {
  const tier = raw.match(/Tier\s+(\d+)/)?.[1] + "T" || "-";
  const waveNum = raw.match(/Wave\s+(\d+)/)?.[1] || "-";
  const wave = waveNum.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "W";

  return `${tier} ${wave}`;
};

const prettyNumber = (num) => {
  const n = Number(num);   // <-- 문자열이면 숫자로 강제 변환

  if (isNaN(n)) return num; // 혹시 변환 실패하면 원본 그대로

  if (n < 1000) {
    return Number(n.toFixed(2));
  }

  return formatNumber(n);
};



/* ==========================================================
                          App()
   ========================================================== */

export default function App() {
  
  /* ------------------ 상태 ------------------ */
  const [input, setInput] = useState("");
  const [savedList, setSavedList] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const [activeTab, setActiveTab] = useState("배틀리포트");
  const [filterType, setFilterType] = useState("전체");

  const [dailyStatList, setDailyStatList] = useState([]);
  const [dayRange, setDayRange] = useState(30); // 7 | 30 | all

  const lastVisibleRef = useRef(null);
  const observerRef = useRef(null);
  const modalRef = useRef(null);

  const [openMemos, setOpenMemos] = useState({});
  const [hasMore, setHasMore] = useState(true);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 480);
  const [saveType, setSaveType] = useState("전체");

//   const [readCount, setReadCount] = useState(
    
//   Number(localStorage.getItem("readCount") || 0)
// );
  const [globalReads, setGlobalReads] = useState(0);

  const readCostKRW = Math.round(globalReads * 0.0000006 * 1471.9);
// Firestore 전역 readCount 증가

async function addGlobalReads(value) {
  const ref = doc(db, "systemMeta", "readStats");
  await updateDoc(ref, {
    totalReads: increment(value)   // 👉 자동으로 정확하게 증가
  });
}



const loadGlobalReads = async () => {
  const ref = doc(db, "systemMeta", "readStats");
  const snap = await getDoc(ref);

  if (snap.exists()) {
    setGlobalReads(snap.data().totalReads || 0);
  } else {
    setGlobalReads(0);
  }
};

useEffect(() => {
  loadGlobalReads();
}, []);

  


const getUnitFromFormatted = (str) => {
  if (!str) return null;

  // 15.02q/h → q
  // 143.81K/h → K
  // 121.24K → K
  const match = str.match(/([0-9.]+)([a-zA-Z]+)(\/h)?$/);

  return match ? match[2] : null;
};




const styleByUnit = (str) => {
  const unit = getUnitFromFormatted(str);
  const level = UNIT_LEVEL[unit] || 0;

  const styles = {
    0: { fontSize: 11, fontWeight: 500, opacity: 0.6, color: "#888" },//
    1: { fontSize: 12, fontWeight: 600, opacity: 0.8, color: "#666" },//k
    2: { fontSize: 13, fontWeight: 700, opacity: 1.0, color: "#666" },//m
    3: { fontSize: 14, fontWeight: 800, opacity: 1.0, color: "#666" },//b
    4: { fontSize: 15, fontWeight: 900, opacity: 1.0, color: "#666" },//t
    5: { fontSize: 17, fontWeight: 900, opacity: 1.0, color: "#111" },//q
    6: { fontSize: 19, fontWeight: 900, opacity: 1.0, color: "#000" },//Q
  };

  return styles[level] || styles[0];
};



  /* ------------------ 공통 버튼 스타일 ------------------ */
  const uiBtn = {
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
    transition: "0.15s"
  };

  /* ------------------ 모바일 감지 ------------------ */
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 480);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ------------------ Killed By 모양 ------------------ */
  const renderKillShape = (type, color) => {
    const shape = KILLED_BY_SHAPES[type] || "square";

    const baseStyle = {
      width: 10,
      height: 10,
      background: color,
      display: "inline-block"
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
            borderBottom: `10px solid ${color}`
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
            clipPath:
              "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)"
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
            clipPath:
              "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)"
          }}
        />
      );
    }

    return <span style={{ ...baseStyle, borderRadius: 2 }} />;
  };

  /* ==========================================================
                        extractSummary()
     (Killed By + 코인/셀 + 딜 비율) 완전 복원
  ========================================================== */

  const extractSummary = (raw) => {
    // Real Time
    const timeLine =
      raw.split("\n").find((l) => l.includes("Real Time")) || "";
    const { h, m, s } = extractTime(timeLine);

    // Coins
    const coinsLine = raw
      .split("\n")
      .find((l) => l.includes("Coins earned"));
    const coinsRaw =
      coinsLine?.split("\t")[1]?.trim() ||
      coinsLine?.split(":")[1]?.trim() ||
      "0";
    const coinsFormatted = formatNumber(parseNumber(coinsRaw));

    const cphMatch = raw.match(/Coins per hour\s+([\d.]+\w+)/);
    const cph = cphMatch ? cphMatch[1] + "/h" : "-";

    // Cells
    const cellsLine = raw
      .split("\n")
      .find((l) => l.includes("Cells Earned"));
    const cellsRaw =
      cellsLine?.split("\t")[1]?.trim() ||
      cellsLine?.split(":")[1]?.trim() ||
      "0";

    const cellsValue = parseNumber(cellsRaw);
    const playSeconds = h * 3600 + m * 60 + s;

    const cellsPerHour =
      playSeconds > 0
        ? formatNumber((cellsValue / playSeconds) * 3600)
        : "-";

        

// Reroll Shards
const rerollLine = raw
  .split("\n")
  .find((l) => l.includes("Reroll Shards Earned"));

const rerollRaw =
  rerollLine?.split("\t")[1]?.trim() ||
  rerollLine?.split(":")[1]?.trim() ||
  "0";

const rerollValue = parseNumber(rerollRaw);

// 시간당 리롤샤드
const rerollPerHour =
  playSeconds > 0
    ? formatNumber((rerollValue / playSeconds) * 3600)
    : "-";

    
    // Killed By
    let killedBy = "";
    const killedLine = raw
      .split("\n")
      .find((l) => l.startsWith("Killed By"));

    if (killedLine) {
      const value = killedLine.split("\t")[1]?.trim();
      if (value && value !== "0") {
        killedBy = value;
      }
    }

    // Damage breakdown
    const lines = raw.split("\n");
    const totalDamageLine = lines.find((l) =>
      l.toLowerCase().startsWith("damage dealt")
    );
    const totalDamage = totalDamageLine
      ? parseNumber(
          totalDamageLine.split("\t")[1]?.trim() ||
            totalDamageLine.split(":")[1]?.trim() ||
            "0"
        )
      : 0;

const damages = lines
  .filter(
    (l) =>
      l.toLowerCase().includes("damage") &&
      !l.toLowerCase().startsWith("damage dealt")
  )
  .map((l) => {
    const nameRaw = (l.split("\t")[0] || l.split(":")[0]).trim();
    if (
      IGNORE_LIST.some((ig) =>
        nameRaw.toLowerCase().includes(ig)
      )
    )
      return null;

    const num = parseNumber(
      l.split("\t")[1]?.trim() ||
        l.split(":")[1]?.trim() ||
        "0"
    );
    const pct = totalDamage ? (num / totalDamage) * 100 : 0;
    if (pct < 1) return null;

    const normalized = nameRaw
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace("damage", "");

    return {
      key: normalized,
      label: SHORT_NAMES[normalized] || nameRaw,
      pct: pct.toFixed(0)
    };
  })
  .filter(Boolean)
  .sort((a, b) => b.pct - a.pct);


    return (
      <>
        {/* Killed By 뱃지 */}
        {/* {killedBy && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
              marginBottom: 4
            }}
          >
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
                background:
                  (KILLED_BY_COLORS[killedBy] ||
                    "#ffd6d6") + "66",
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
          </div>
        )} */}

        {/* 코인 / 셀 요약 */}
  <div style={{ marginTop: killedBy ? 2 : 6 }}>
<div
style={{
  display: "flex",
  flexWrap: "wrap",     // 🔥 줄바꿈 허용
  alignItems: "center",
  gap: isMobile ? 6 : 12,
  lineHeight: 1.4,
  fontWeight: 600,
  fontSize: isMobile ? 12 : 13,
  whiteSpace: "normal",  // 🔥 nowrap 제거
}}

>

<span style={styleByUnit(cph)}>
  Ⓒ {cph}
</span>


<span style={styleByUnit(prettyNumber(cellsPerHour) + "")}>
  <span style={{ color: "#f5c518" }}>▲</span> {prettyNumber(cellsPerHour)}/h
</span>


<span style={styleByUnit(prettyNumber(rerollPerHour) + "")}>
  🎲 {prettyNumber(rerollPerHour)}/h
</span>


</div>



  </div>

  

        {/* 딜 비율 태그 */}
        {damages.length > 0 && (
          <div
            style={{
              marginTop: 6,
              display: "flex",
              flexWrap: "wrap",
              gap: 6
            }}
          >
{damages.map((d) => (
  <span
    key={d.key}
    style={{
      background: DAMAGE_COLORS[d.key] || "#888",
      color: getTextColor(DAMAGE_COLORS[d.key] || "#888"),
      borderRadius: 4,
      padding: "2px 6px",
      fontSize: 12,
      fontWeight: 600
    }}
  >
    {d.label}: {d.pct}%
  </span>
))}

          </div>
        )}
      </>
    );
  };

  /* ==========================================================
                        Firestore 저장
  ========================================================== */

  const saveReport = async () => {
    if (!input.trim()) return alert("입력값 없어!");

    const formatted = formatBattleDate(input);
    if (!formatted) return alert("날짜 파싱 실패");

    const date = formatted.split(" ")[0];

    const timeLine = input
      .split("\n")
      .find((l) => l.includes("Real Time"));
    const { h, m, s } = extractTime(timeLine);
    const seconds = h * 3600 + m * 60 + s;

// Coins
const coinsLine = input
  .split("\n")
  .find((l) => l.includes("Coins earned"));
const coins = parseStat(coinsLine);

// Cells
const cellsLine = input
  .split("\n")
  .find((l) => l.includes("Cells Earned"));
const cellsValue = parseStat(cellsLine);

// Reroll
const rerollLine = input
  .split("\n")
  .find((l) => l.includes("Reroll Shards Earned"));
const rerollValue = parseStat(rerollLine);


    await addDoc(collection(db, "reports"), {
      raw: input,
      timestamp: Date.now(),
      type: saveType,   // 🔥 선택한 타입
      memo: "",
      meta: { date, coins, seconds }
    });

    // 날짜별 통계 반영
    const statRef = doc(db, "dailyStats", date);
    const snap = await getDoc(statRef);

if (snap.exists()) {
  const prev = snap.data();
  await updateDoc(statRef, {
    totalCoins: prev.totalCoins + coins,
    totalSeconds: prev.totalSeconds + seconds,
    totalCells: (prev.totalCells || 0) + cellsValue,
    totalReroll: (prev.totalReroll || 0) + rerollValue,
  });
} else {
  await setDoc(statRef, {
    totalCoins: coins,
    totalSeconds: seconds,
    totalCells: cellsValue,
    totalReroll: rerollValue,
  });
}

    setInput("");
    // 🔥 리스트 초기화
    setSavedList([]);
    lastVisibleRef.current = null;
    setHasMore(true);

    // 🔥 현재 필터 기준으로 즉시 재로드
    loadSavedList(filterType, false);
  };


// Firestore 목록 로딩 + 무한 스크롤
const loadSavedList = async (type = filterType, isMore = false) => {
  if (!hasMore && isMore) return;

  const baseRef = collection(db, "reports");
  let q;

  // 공통 옵션
  const constraints = [];

  // 타입별 쿼리 조건
  if (type === "전체") {
    // 아무 조건 없음
  } else if (type === "낭비") {
    constraints.push(where("type", "not-in", ["파밍", "토너", "등반", "리롤"]));
  } else {
    constraints.push(where("type", "==", type));
  }

  // 정렬
  constraints.push(orderBy("timestamp", "desc"));

  // 페이지네이션
  if (isMore && lastVisibleRef.current) {
    constraints.push(startAfter(lastVisibleRef.current));
  }

  constraints.push(limit(PAGE_SIZE));

  // 최종 쿼리 생성
  q = query(baseRef, ...constraints);

const snap = await getDocs(q);

// 🔥 Firestore 실제 읽기 비용만큼 증가
const readUsed = snap.docs.length;

// setReadCount(prev => {
//   const newVal = prev + readUsed;
//   localStorage.setItem("readCount", newVal);
//   return newVal;
// });
await addGlobalReads(readUsed);
setGlobalReads(prev => prev + readUsed);




  if (snap.empty) {
    setHasMore(false);
    return;
  }

  lastVisibleRef.current = snap.docs[snap.docs.length - 1];

  const newData = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  setSavedList((prev) => (isMore ? [...prev, ...newData] : newData));
};


// 필터 변경
const handleFilterClick = (tab) => {
  setFilterType(tab);

  // 초기화
  setSavedList([]);
  lastVisibleRef.current = null;
  setHasMore(true);

  // 해당 타입만 다시 로드
  loadSavedList(tab, false);
};

  //첫 로딩을 파밍으로
const firstLoadRef = useRef(false);

useEffect(() => {
  if (firstLoadRef.current) return; // 두 번째 실행 막기
  firstLoadRef.current = true;

  handleFilterClick("파밍");
}, []);



  // 무한 스크롤 감지 ref
const lastItemRef = useCallback((node) => {
  if (!hasMore) return;

  if (observerRef.current) observerRef.current.disconnect();

  observerRef.current = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      loadSavedList(filterType, true);
    }
  });

  if (node) observerRef.current.observe(node);
}, [hasMore, filterType]);

  /* ==========================================================
                      날짜별 통계 로딩
  ========================================================== */

  const loadDailyStats = async () => {
    let q;

    if (dayRange === "all") {
      q = query(
        collection(db, "dailyStats"),
        orderBy("__name__", "desc")
      );
    } else {
      q = query(
        collection(db, "dailyStats"),
        orderBy("__name__", "desc"),
        limit(dayRange)
      );
    }

    const snap = await getDocs(q);

// 읽은 문서 개수
const readUsed = snap.docs.length;

// setReadCount(prev => {
//   const newVal = prev + readUsed;
//   localStorage.setItem("readCount", newVal);
//   return newVal;
// });
await addGlobalReads(readUsed);
setGlobalReads(prev => prev + readUsed);


    setDailyStatList(
      snap.docs.map((d) => ({
        date: d.id,
        ...d.data()
      }))
    );
  };

  useEffect(() => {
    const run = async () => {
      if (activeTab === "날짜별통계") {
        await loadDailyStats();
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dayRange]);

  /* 🔁 날짜별 통계 재생성 (기존 기능 완전 복원) */
  const rebuildDailyStats = async () => {
    if (
      !confirm(
        "⚠️ 기존 모든 리포트를 날짜별 통계로 재집계할까? (1회 실행용)"
      )
    )
      return;

    console.log("🔁 날짜별 통계 재집계 시작...");

const snap = await getDocs(collection(db, "reports"));

// 🔥 읽기 비용 집계
// setReadCount(prev => {
//   const newVal = prev + snap.docs.length;
//   localStorage.setItem("readCount", newVal);
//   return newVal;
// });
await addGlobalReads(readUsed);
setGlobalReads(prev => prev + readUsed);

    
    const stats = {};

snap.docs.forEach((d) => {
  const item = d.data();
  if (!item.raw) return;

  const formatted = formatBattleDate(item.raw);
  if (!formatted) return;

  const date = formatted.split(" ")[0];

  // Real Time
  const timeLine = item.raw
    .split("\n")
    .find((l) => l.includes("Real Time"));
  const { h, m, s } = extractTime(timeLine);
  const seconds = h * 3600 + m * 60 + s;

  // Coins
const coinsLine = item.raw
  .split("\n")
  .find((l) => l.includes("Coins earned"));
const coins = parseNumber(
  coinsLine?.split("\t")[1] ||
    coinsLine?.split(":")[1] ||
    "0"
);

// Cells
const cellsLine = item.raw
  .split("\n")
  .find((l) => l.includes("Cells Earned"));
const cellsValue = parseNumber(
  cellsLine?.split("\t")[1] ||
    cellsLine?.split(":")[1] ||
    "0"
);

// Reroll Shards
const rerollLine = item.raw
  .split("\n")
  .find((l) => l.includes("Reroll Shards Earned"));
const rerollValue = parseNumber(
  rerollLine?.split("\t")[1] ||
    rerollLine?.split(":")[1] ||
    "0"
);

  // 누적 저장
  if (!stats[date]) {
    stats[date] = {
      totalCoins: 0,
      totalSeconds: 0,
      totalCells: 0,
      totalReroll: 0,
    };
  }

  stats[date].totalCoins += coins;
  stats[date].totalSeconds += seconds;
  stats[date].totalCells += cellsValue;
  stats[date].totalReroll += rerollValue;
});


    for (const date of Object.keys(stats)) {
      await setDoc(doc(db, "dailyStats", date), stats[date]);
      console.log(`✅ ${date} 통계 저장 완료`, stats[date]);
    }

    alert("✅ 기존 데이터 날짜별 통계 재작성 완료!");
    loadDailyStats();
  };




  /* ==========================================================
                            UI
  ========================================================== */

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      {/* 비용계산 */}
      <div style={{
        color: '#adadadff',
        fontSize: 12,
        borderRadius: 6,
        fontWeight:500,
        textAlign: "center",
        }}>
      읽기: {globalReads.toLocaleString()}회 /
      비용: {Math.round(readCostKRW).toLocaleString()}원
      </div>

      {/* 타이틀 */}
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div
          style={{
            fontSize: 36,
            fontWeight: 900,
            letterSpacing: "-0.8px",
            color: "#0b1c3d",
            textShadow: "0 4px 16px rgba(0,0,0,0.25)"
          }}
        >
          Tower Log
        </div>


        

        <div
          style={{ fontSize: 13, marginTop: 6, color: "#777" }}
        >
          Battle Records & Growth Analytics
        </div>
      </div>

      {/* 탭 */}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 12 }}
      >
        {["배틀리포트", "날짜별통계"].map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 8,
              border: "none",
              background:
                activeTab === t ? "#0077b6" : "#eee",
              color: activeTab === t ? "white" : "#333",
              fontWeight: 600
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* -------------------------------------------------------
                        배틀 리포트 탭
      --------------------------------------------------------- */}
      {activeTab === "배틀리포트" && (
        <>
          {/* 입력 + 저장 + 필터 (한 줄 레이아웃) */}
          <BattleReportInput
            input={input}
            setInput={setInput}
            saveReport={saveReport}
            filterType={filterType}
            onFilterClick={handleFilterClick}
            isMobile={isMobile}
            saveType={saveType}
            setSaveType={setSaveType}
          />

          {/* 리스트 뷰어 */}
          <BattleReportViewer
            savedList={savedList}
            filterType={filterType}
            extractSummary={extractSummary}
            extractTierWave={extractTierWave}
            extractTime={extractTime}
            formatBattleDate={formatBattleDate}
            openMemos={openMemos}
            setOpenMemos={setOpenMemos}
            lastItemRef={lastItemRef}
            isMobile={isMobile}
            onClickItem={(item) => {
              setSelectedReport(item);
              setModalVisible(true);
            }}
          />
        </>
      )}

      {/* -------------------------------------------------------
                         날짜별 통계 탭
      --------------------------------------------------------- */}
      {activeTab === "날짜별통계" && (
        <DailyStatsViewer
          dailyStatList={dailyStatList}
          dayRange={dayRange}
          setDayRange={setDayRange}
          rebuildStats={rebuildDailyStats}
          formatTime={formatTime}
          formatNumber={formatNumber}
        />
      )}

      {/* ===================== 모달 ===================== */}
      {modalVisible && selectedReport && (
        <div
          onClick={(e) => {
            if (
              modalRef.current &&
              !modalRef.current.contains(e.target)
            ) {
              setModalVisible(false);
              setSelectedReport(null);
            }
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000
          }}
        >
          <div
            ref={modalRef}
            style={{
              background: "white",
              padding: 20,
              borderRadius: 10,
              width: "85%",
              maxWidth: 520,
              maxHeight: "80%",
              overflowY: "auto",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
            }}
          >
            <h2>전투 리포트</h2>

            {/* 원본 리포트 */}
            <textarea
              value={selectedReport.raw}
              readOnly
              style={{
                width: "100%",
                height: 160,
                marginTop: 10,
                padding: 12,
                borderRadius: 10,
                border: "1px solid #ddd",
                resize: "none",
                background: "#f7f7f7",
                fontFamily: "monospace",
                fontSize: 12,
                lineHeight: 1.4
              }}
            />

            {/* 메모 */}
            <textarea
              value={selectedReport.memo || ""}
              onChange={(e) =>
                setSelectedReport((prev) => ({
                  ...prev,
                  memo: e.target.value
                }))
              }
              placeholder="메모 수정"
              style={{
                width: "100%",
                height: 90,
                marginTop: 10,
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ddd",
                resize: "none",
                fontSize: 13
              }}
            />

            {/* 타입 선택 + 삭제 + 메모 저장 */}
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 12,
                flexWrap: "wrap"
              }}
            >
              <select
                value={selectedReport.type}
                onChange={async (e) => {
                  const newType = e.target.value;
                  await updateDoc(
                    doc(db, "reports", selectedReport.id),
                    { type: newType }
                  );
                  setSelectedReport((prev) => ({
                    ...prev,
                    type: newType
                  }));
                  loadSavedList(false);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  fontWeight: 700,
                  background: "#f9f9f9",
                  cursor: "pointer",
                  boxShadow:
                    "0 2px 6px rgba(0,0,0,0.1)"
                }}
              >
                {Object.keys(TAB_COLORS).map((tab) => (
                  <option key={tab} value={tab}>
                    {tab}
                  </option>
                ))}
              </select>

              <button
                onClick={async () => {
                  if (!confirm("삭제할까?")) return;
                  await deleteDoc(
                    doc(db, "reports", selectedReport.id)
                  );
                  setModalVisible(false);
                  setSelectedReport(null);
                  loadSavedList(false);
                }}
                style={{
                  ...uiBtn,
                  background:
                    "linear-gradient(135deg,#ff5252,#c62828)",
                  color: "white"
                }}
              >
                삭제
              </button>

              <button
                onClick={async () => {
                  await updateDoc(
                    doc(db, "reports", selectedReport.id),
                    {
                      memo: selectedReport.memo || ""
                    }
                  );

                  setSavedList((prev) =>
                    prev.map((item) =>
                      item.id === selectedReport.id
                        ? {
                            ...item,
                            memo: selectedReport.memo
                          }
                        : item
                    )
                  );

                  setModalVisible(false);
                  setSelectedReport(null);
                }}
                style={{
                  ...uiBtn,
                  background:
                    "linear-gradient(135deg,#42a5f5,#1565c0)",
                  color: "white"
                }}
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
