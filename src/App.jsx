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
  };

  const deleteReport = async (id) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "reports", id));
    if (selectedReport?.id === id) setSelectedReport(null);
    loadSavedList();
  };

  const changeReportType = async (id, type) => {
    await updateDoc(doc(db, "reports", id), { type });
    setSelectedReport({...selectedReport, type});
    loadSavedList();
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

      const timeLine = item.raw.split("\n").find(l=>l.includes("Real Time"));
      const timeMatch = timeLine?.match(/(\d+)h (\d+)m (\d+)s/);
      const seconds = timeMatch ? parseInt(timeMatch[1])*3600 + parseInt(timeMatch[2])*60 + parseInt(timeMatch[3]) : 0;

      const coinsLine = item.raw.split("\n").find(l=>l.includes("Coins earned"));
      const coins = parseNumber(coinsLine?.split("\t")[1]?.trim() || coinsLine?.split(":")[1]?.trim() || "0");

      if (!stats[date]) stats[date] = { coins:0, seconds:0, typeSeconds: { 파밍:0, 토너:0, 등반:0, 리롤:0 } };

      stats[date].coins += coins;
      stats[date].seconds += seconds;

      if (item.type && item.type !== "전체") stats[date].typeSeconds[item.type] += seconds;
    });

    return Object.entries(stats).sort(([a],[b]) => new Date(b) - new Date(a));
  };

  return (
    <div style={{padding:"20px"}}>
      <h1>Battle Report</h1>

      {/* 상단 탭 */}
      <div style={{marginBottom:"10px"}}>
        <button onClick={()=>setActiveTab("배틀리포트")} style={{marginRight:"6px"}}>배틀리포트</button>
        <button onClick={()=>setActiveTab("날짜별 통계")} style={{marginRight:"6px"}}>날짜별 통계</button>
      </div>

      {/* 배틀리포트 탭 */}
      {activeTab === "배틀리포트" && (
        <>
        {/* 타입 필터 */}
        <div style={{marginBottom:"10px"}}>
          {Object.keys(tabColors).map(tab => (
            <button key={tab} onClick={()=>setFilterType(tab)}
              style={{
                marginRight:"6px", padding:"6px 12px", border:"none",
                borderRadius:"4px", cursor:"pointer", color:"white",
                backgroundColor: filterType===tab ? tabColors[tab] : tabColors[tab]+"66"
              }}>{tab}</button>
          ))}
        </div>

        {/* 저장 리포트 */}
        <div style={{marginBottom:"20px"}}>
          <h2>저장된 리포트</h2>
          {savedList.filter(r=>filterType==="전체"||r.type===filterType).map(item=>{
            const battleDate = formatBattleDate(item.raw);
            const summary = extractSummary(item.raw);
            const border = selectedReport?.id===item.id ? "2px solid #000" : "1px solid #ccc";
            return (
              <div key={item.id} style={{padding:"6px", borderBottom:border, cursor:"pointer", backgroundColor:tabColors[item.type]+"22"}} onClick={()=>loadReport(item)}>
                {battleDate} {summary}
              </div>
            )
          })}
        </div>

        {/* 선택 리포트 */}
        {selectedReport && (
          <div style={{marginBottom:"20px"}}>
            <select value={selectedReport.type} onChange={e=>changeReportType(selectedReport.id,e.target.value)}
              style={{padding:"6px", marginRight:"10px"}}>
              {Object.keys(tabColors).map(tab => <option key={tab} value={tab}>{tab}</option>)}
            </select>
            <button onClick={()=>deleteReport(selectedReport.id)}
              style={{padding:"6px 12px", backgroundColor:"#ff4444", color:"white", border:"none", borderRadius:"4px", cursor:"pointer"}}>
              삭제
            </button>
          </div>
        )}

        <textarea style={{width:"100%", height:"200px"}} value={input} placeholder="여기에 Battle Report 붙여넣기" onChange={e=>setInput(e.target.value)} />
        <button onClick={analyze} style={{marginTop:"10px", width:"100%"}}>분석</button>
        <button onClick={saveReport} style={{marginTop:"10px", padding:"10px", width:"100%", backgroundColor:"#4CAF50", color:"white"}}>저장</button>

        {/* 파이차트 */}
        {result.length>0 && result[0].name!=="총 대미지를 찾을 수 없음" && (
          <div style={{marginTop:"30px"}}>
            <h2>데미지 비율</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={result.filter(d=>d.name!=="합계")} dataKey="percent" nameKey="name" outerRadius={120} label={false}>
                  {result.filter(d=>d.name!=="합계").map((entry,index)=>(<Cell key={index} fill={COLORS[index%COLORS.length]}/>))}
                </Pie>
                <Tooltip formatter={v=>v.toFixed(2)+"%"}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 데미지 목록 */}
        {result.length>0 && (
          <div style={{marginTop:"20px"}}>
            <h2>데미지 목록</h2>
            {result.filter(r=>r.name!=="합계").map((item,i)=>(<div key={i} style={{marginBottom:"6px"}}><b>{item.name}:</b> {item.percent.toFixed(2)}%</div>))}
            <div style={{marginTop:"10px", fontWeight:"bold"}}>합계: {result[result.length-1].percent.toFixed(2)}%</div>
          </div>
        )}
        </>
      )}

      {/* 날짜별 통계 탭 */}
      {activeTab === "날짜별 통계" && (
        <div style={{marginTop:"20px"}}>
          <h2>날짜별 통계 (24시간 기준)</h2>
          {dailyStats().map(([date, stat]) => {
            const totalSeconds = Object.values(stat.typeSeconds).reduce((a,b)=>a+b,0);
            const daySeconds = 24*3600;
            const fullPercent = (totalSeconds/daySeconds*100).toFixed(2);
            const wastePercent = (100 - fullPercent).toFixed(2);

            const typePercents = Object.fromEntries(
              Object.entries(stat.typeSeconds).map(([k,v])=>[k, (v/daySeconds*100).toFixed(2)])
            );

            return (
              <div key={date} style={{marginBottom:"6px"}}>
                <b>{date}:</b> Coins: {formatNumber(stat.coins)}, Real Time: {(stat.seconds/3600).toFixed(2)}h, 전체: {fullPercent}% (파밍: {typePercents.파밍}%, 토너: {typePercents.토너}%, 등반: {typePercents.등반}%, 리롤: {typePercents.리롤}%), 낭비: {wastePercent}%
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
}
