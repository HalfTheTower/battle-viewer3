import { useState, useEffect } from "react";
import { parseNumber, formatNumber } from "./parser";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

export default function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState([]);
  const [savedList, setSavedList] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [activeTab, setActiveTab] = useState("배틀리포트");
  const [filterType, setFilterType] = useState("전체");

  const tabColors = {
    전체: "#8884d8",
    파밍: "#36a2eb",
    토너: "#ff6384",
    등반: "#4bc0c0",
    리롤: "#ffcd56",
  };

  const COLORS = [
    "#ff6384","#36a2eb","#ffcd56","#4bc0c0","#9966ff","#ff9f40","#00c49f","#ff4444","#8884d8","#82ca9d",
  ];

  useEffect(() => { loadSavedList(); }, []);

  const parseBattleDate = (raw) => {
    const match = raw.match(/Battle Date\s+([A-Za-z]{3}) (\d{2}), (\d{4}) (\d{2}:\d{2})/);
    if (!match) return new Date(0);
    const [, monStr, day, year, time] = match;
    const months = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
                     Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
    const mon = months[monStr];
    return new Date(`${year}-${mon}-${day}T${time}:00`);
  };

  const formatBattleDate = (raw) => {
    const match = raw.match(/Battle Date\s+([A-Za-z]{3}) (\d{2}), (\d{4}) (\d{2}:\d{2})/);
    if (!match) return "날짜 없음";
    const [, monStr, day, year, time] = match;
    const months = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
                     Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
    return `${year}-${months[monStr]}-${day} ${time}`;
  };

  const extractSummary = (raw) => {
    const tier = raw.match(/Tier\s+(\d+)/)?.[1] + "T" || "-";
    const wave = raw.match(/Wave\s+(\d+)/)?.[1] + "W" || "-";
    const cph = raw.match(/Coins per hour\s+([\d.]+\w+)/)?.[1] + "/h" || "-";
    return `${tier} ${wave} ${cph}`;
  };

  const loadSavedList = async () => {
    const snap = await getDocs(collection(db, "reports"));
    const arr = [];
    snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
    arr.sort((a,b) => parseBattleDate(b.raw) - parseBattleDate(a.raw));
    setSavedList(arr);
  };

  const saveReport = async () => {
    if (!input.trim()) return alert("입력값이 없어!");
    if (savedList.some(r => r.raw === input)) return alert("이미 등록된 전투기록입니다!");
    await addDoc(collection(db, "reports"), { raw: input, timestamp: Date.now(), type:"전체" });
    alert("저장 완료!");
    setInput("");
    loadSavedList();
  };

  const loadReport = (item) => {
    setSelectedReport(item);
    setInput(item.raw);
    setResult([]);
    // scroll to input on mobile could be added if desired
  };

  const deleteReport = async (id) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "reports", id));
    if (selectedReport?.id === id) setSelectedReport(null);
    loadSavedList();
  };

  const changeReportType = async (id, type) => {
    await updateDoc(doc(db, "reports", id), { type });
    setSelectedReport(prev => prev ? { ...prev, type } : null);
    await loadSavedList();
  };

  const ignoreList = [
    "damage taken","damage taken wall","damage taken while berserked",
    "damage gain from berserk","death defy","lifesteal","projectiles count",
    "enemies hit by orbs","land mines spawned","tagged by deathwave"
  ];

  // 배틀 리포트 분석
  const analyze = () => {
    const lines = input.split("\n");
    let totalDamage = 0, damages = [];
    for (let line of lines) {
      if (line.toLowerCase().startsWith("damage dealt")) {
        const value = line.split("\t")[1]?.trim() || line.split(":")[1]?.trim();
        totalDamage = parseNumber(value);
      }
    }
    if (!totalDamage) { setResult([{name:"총 대미지를 찾을 수 없음", percent:0}]); return; }

    for (let line of lines) {
      if (!line.toLowerCase().includes("damage") || line.toLowerCase().startsWith("damage dealt")) continue;
      let name = (line.split("\t")[0] || line.split(":")[0]).trim().toLowerCase();
      if (ignoreList.some(ig => name.includes(ig))) continue;
      let value = line.split("\t")[1]?.trim() || (line.includes(":")?line.split(":")[1]?.trim():null);
      if (!value) continue;
      const num = parseNumber(value);
      const pct = (num / totalDamage) * 100;
      if (pct<1) continue;
      damages.push({name: name.charAt(0).toUpperCase()+name.slice(1), percent: pct});
    }

    damages.sort((a,b)=>b.percent-a.percent);
    damages.push({name:"합계", percent: damages.reduce((acc,c)=>acc+c.percent,0)});
    setResult(damages);
  };

  // 날짜별 통계 계산 (타입별 시간 + 낭비 포함)
  const dailyStats = () => {
    const stats = {};
    savedList.forEach(item => {
      const date = formatBattleDate(item.raw).split(" ")[0];

      const timeLine = item.raw.split("\n").find(l => l.includes("Real Time"));

      let h = 0, m = 0, s = 0;

      if (timeLine) {
        const hMatch = timeLine.match(/(\d+)h/);
        const mMatch = timeLine.match(/(\d+)m/);
        const sMatch = timeLine.match(/(\d+)s/);

        h = hMatch ? parseInt(hMatch[1]) : 0;
        m = mMatch ? parseInt(mMatch[1]) : 0;
        s = sMatch ? parseInt(sMatch[1]) : 0;
      }

      const seconds = h * 3600 + m * 60 + s;

      const coinsLine = item.raw.split("\n").find(l=>l.includes("Coins earned"));
      const coins = parseNumber(coinsLine?.split("\t")[1]?.trim() || coinsLine?.split(":")[1]?.trim() || "0");

      if (!stats[date]) stats[date] = { coins:0, seconds:0, typeSeconds: { 파밍:0, 토너:0, 등반:0, 리롤:0 } };

      stats[date].coins += coins;
      stats[date].seconds += seconds;

      if (item.type && item.type !== "전체") stats[date].typeSeconds[item.type] += seconds;
    });

    return Object.entries(stats).sort(([a],[b]) => new Date(b) - new Date(a));
  };

  // helper: badge style
  const badgeStyle = (type) => ({
    background: tabColors[type] || "#ddd",
    color: "white",
    padding: "4px 8px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "600"
  });

  return (
    <div style={{padding:"18px", maxWidth:1200, margin:"0 auto", boxSizing:"border-box"}}>
      {/* 내부 CSS (반응형) */}
      <style>{`
        .tabs { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
        .tab-btn { padding:8px 12px; border-radius:8px; border:none; cursor:pointer; font-weight:600; }
        .controls { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
        .list-grid { display:grid; grid-template-columns: repeat(1, 1fr); gap:12px; }
        .card { background:white; padding:12px; border-radius:10px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); border:1px solid #eee; }
        .card .meta { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; }
        .card .summary { color:#555; font-size:13px; margin-top:6px; }
        .input-area textarea { width:100%; min-height:160px; padding:10px; border-radius:8px; border:1px solid #ddd; resize:vertical; box-sizing:border-box; }
        .btn { padding:10px 12px; border-radius:8px; border:none; cursor:pointer; font-weight:600; }
        .btn-primary { background:#4CAF50; color:white; }
        .btn-danger { background:#ff4444; color:white; }
        .small { font-size:13px; color:#666; }

        @media(min-width:700px){
          .list-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media(min-width:1100px){
          .list-grid { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>

      <h1 style={{margin:"6px 0 14px 0"}}>Battle Report</h1>

      {/* 상단 탭 */}
      <div className="tabs">
        <button
          className="tab-btn"
          onClick={()=>setActiveTab("배틀리포트")}
          style={{ background: activeTab==="배틀리포트" ? "#222" : "#f0f0f0", color: activeTab==="배틀리포트" ? "#fff" : "#222" }}
        >
          배틀리포트
        </button>
        <button
          className="tab-btn"
          onClick={()=>setActiveTab("날짜별 통계")}
          style={{ background: activeTab==="날짜별 통계" ? "#222" : "#f0f0f0", color: activeTab==="날짜별 통계" ? "#fff" : "#222" }}
        >
          날짜별 통계
        </button>
      </div>

      {/* 배틀리포트 탭 */}
      {activeTab === "배틀리포트" && (
        <>
          {/* 타입 필터 */}
          <div className="controls" style={{marginBottom:12}}>
            {Object.keys(tabColors).map(tab => (
              <button
                key={tab}
                onClick={()=>setFilterType(tab)}
                className="tab-btn"
                style={{
                  background: filterType===tab ? tabColors[tab] : `${tabColors[tab]}33`,
                  color: filterType===tab ? "#fff" : "#000"
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* 저장된 리포트 (카드 그리드) */}
          <div style={{marginBottom:14}}>
            <h2 style={{margin:"8px 0"}}>저장된 리포트</h2>
            <div className="list-grid">
              {savedList.filter(r=>filterType==="전체"||r.type===filterType).map(item=>{
                const battleDate = formatBattleDate(item.raw);
                const summary = extractSummary(item.raw);
                const selected = selectedReport?.id === item.id;
                return (
                  <div
                    key={item.id}
                    className="card"
                    onClick={()=>loadReport(item)}
                    style={{ cursor:"pointer", outline: selected ? `2px solid #222` : "none" }}
                  >
                    <div className="meta">
                      <div>
                        <div style={{fontWeight:700}}>{battleDate}</div>
                        <div className="small">{summary}</div>
                      </div>
                      <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6}}>
                        <div style={badgeStyle(item.type || "전체")}>{item.type || "전체"}</div>
                        <div className="small" style={{color:"#888"}}>{new Date(item.timestamp || 0).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="summary small" style={{marginTop:10, color:"#444"}}>
                      {/* 보여주고 싶은 추가 정보(선택) */}
                      {/* 예: Coins per hour / Tier */}
                    </div>
                  </div>
                )
              })}
              {savedList.filter(r=>filterType==="전체"||r.type===filterType).length === 0 && (
                <div className="card small">저장된 리포트가 없습니다.</div>
              )}
            </div>
          </div>

          {/* 선택 리포트: 타입 변경 + 삭제 (모바일 친화적으로 카드로) */}
          {selectedReport && (
            <div className="card" style={{marginBottom:12}}>
              <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
                <label style={{fontWeight:700}}>선택 리포트</label>
                <select value={selectedReport.type} onChange={e=>changeReportType(selectedReport.id,e.target.value)}
                  style={{padding:"8px", borderRadius:8, border:"1px solid #ddd"}}>
                  {Object.keys(tabColors).map(tab => <option key={tab} value={tab}>{tab}</option>)}
                </select>
                <button className="btn btn-danger" onClick={()=>deleteReport(selectedReport.id)}>삭제</button>
              </div>
              <div style={{marginTop:8, whiteSpace:"pre-wrap", fontSize:13, color:"#444", maxHeight:160, overflow:"auto"}}>
                {selectedReport.raw}
              </div>
            </div>
          )}

          {/* 입력 & 버튼 그룹 */}
          <div className="card input-area" style={{marginBottom:12}}>
            <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:8}}>
              <div style={{fontWeight:700}}>새 리포트 입력</div>
              <div className="small" style={{color:"#666"}}>Battle Report 텍스트 전체를 붙여넣기</div>
            </div>

            <textarea value={input} placeholder="여기에 Battle Report 붙여넣기" onChange={e=>setInput(e.target.value)} />

            <div style={{display:"flex", gap:8, marginTop:10, flexWrap:"wrap"}}>
              <button className="btn btn-primary" onClick={analyze} style={{flex:1}}>분석</button>
              <button className="btn" onClick={saveReport} style={{flex:1, background:"#4CAF50", color:"#fff"}}>저장</button>
              <button className="btn" onClick={()=>{ setInput(""); setResult([]); setSelectedReport(null); }} style={{flex:1, background:"#eee"}}>초기화</button>
            </div>
          </div>

          {/* 분석 결과(파이차트) */}
          {result.length>0 && result[0].name!=="총 대미지를 찾을 수 없음" && (
            <div className="card" style={{marginBottom:12}}>
              <h3 style={{margin:"0 0 8px 0"}}>데미지 비율</h3>
              <div style={{width:"100%", height:260}}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={result.filter(d=>d.name!=="합계")} dataKey="percent" nameKey="name" outerRadius={80} label={false}>
                      {result.filter(d=>d.name!=="합계").map((entry,index)=>(<Cell key={index} fill={COLORS[index%COLORS.length]}/>))}
                    </Pie>
                    <Tooltip formatter={v=>v.toFixed(2)+"%"} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 데미지 목록 */}
          {result.length>0 && (
            <div className="card" style={{marginBottom:20}}>
              <h3 style={{margin:"0 0 10px 0"}}>데미지 목록</h3>
              <div style={{display:"grid", rowGap:8}}>
                {result.filter(r=>r.name!=="합계").map((item,i)=>(
                  <div key={i} style={{display:"flex", justifyContent:"space-between", gap:8, alignItems:"center"}}>
                    <div style={{fontWeight:600}}>{item.name}</div>
                    <div style={{color:"#333"}}>{item.percent.toFixed(2)}%</div>
                  </div>
                ))}
                <div style={{borderTop:"1px dashed #eee", paddingTop:8, marginTop:6, fontWeight:700}}>
                  합계: {result[result.length-1].percent.toFixed(2)}%
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 날짜별 통계 탭 (네가 이미 바꾼 카드형 유지) */}
      {activeTab === "날짜별 통계" && (
        <div style={{marginTop:8}}>
          <h2 style={{margin:"6px 0 12px 0"}}>날짜별 통계 (24시간 기준)</h2>

          {dailyStats().map(([date, stat]) => {
            const totalSecondsByType = Object.values(stat.typeSeconds).reduce((a,b)=>a+b,0);
            const totalSecondsAll = stat.seconds || 0;
            const usedSeconds = totalSecondsByType > 0 ? totalSecondsByType : totalSecondsAll;
            const daySeconds = 24 * 3600;

            const fullPercent = ((usedSeconds / daySeconds) * 100);
            const fullPercentStr = fullPercent > 100 ? "100.00" : fullPercent.toFixed(2);
            const wastePercent = Math.max(0, 100 - parseFloat(fullPercentStr)).toFixed(2);

            const typePercents = Object.fromEntries(
              Object.entries(stat.typeSeconds).map(([k, v]) => [
                k, (v / daySeconds * 100).toFixed(2)
              ])
            );

            return (
              <div key={date} className="card" style={{marginBottom:12}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap"}}>
                  <div style={{fontWeight:700}}>{date}</div>
                  <div style={{display:"flex", gap:8, alignItems:"center"}}>
                    <div className="small">Real Time: <b>{(usedSeconds / 3600).toFixed(2)}h</b></div>
                    <div style={badgeStyle(Object.keys(stat.typeSeconds).find(k=>stat.typeSeconds[k]>0) || "전체")}></div>
                  </div>
                </div>

                <div style={{marginTop:8, display:"flex", gap:12, flexWrap:"wrap", alignItems:"center"}}>
                  <div className="small">Coins: <b>{formatNumber(stat.coins)}</b></div>
                  <div className="small">전체 사용률: <b>{fullPercentStr}%</b></div>
                  <div className="small" style={{color:"#999"}}>{totalSecondsByType===0? "(타입 분류 없음: 전체 합계 사용)":""}</div>
                </div>

                <div style={{display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, marginTop:10, fontSize:13}}>
                  <div>파밍: <b>{typePercents.파밍}%</b></div>
                  <div>토너: <b>{typePercents.토너}%</b></div>
                  <div>등반: <b>{typePercents.등반}%</b></div>
                  <div>리롤: <b>{typePercents.리롤}%</b></div>
                </div>

                <div style={{marginTop:8}} className="small">낭비 시간: <b>{wastePercent}%</b></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
