// components/DailyStatsViewer.jsx
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  LabelList
} from "recharts";

export default function DailyStatsViewer({
  dailyStatList,
  dayRange,
  setDayRange,
  rebuildStats,
  formatTime,
  formatNumber
}) {
  const isAll = dayRange === "all";
  const minHeight = 40;

  return (
    <div>
      {/* 탭 */}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 12 }}
      >
        {[7, 30, "all"].map((v) => (
          <button
            key={v}
            onClick={() => setDayRange(v)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              fontWeight: 700,
              background:
                dayRange === v ? "#0077b6" : "#ddd",
              color: dayRange === v ? "white" : "#333",
              cursor: "pointer"
            }}
          >
            {v === "all" ? "전체" : `최근 ${v}일`}
          </button>
        ))}
      </div>

      {/* 재생성 버튼 */}
      <button
        onClick={rebuildStats}
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

      {/* 미니 그래프 */}
      {dailyStatList.length > 0 && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            background: "#fffbe6",
            border: "1px solid #ffe58f",
            borderRadius: 10,
            overflowX: isAll ? "auto" : "hidden",
            whiteSpace: isAll ? "nowrap" : "normal"
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 6
            }}
          >
            📊 날짜별 코인 획득 추이
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              height: minHeight,
              gap: 4
            }}
          >
            {[...dailyStatList].reverse().map((stat, i, arr) => {
              const max = Math.max(
                ...arr.map((v) => v.totalCoins)
              );
              const h = max
                ? (stat.totalCoins / max) * 36
                : 2;

              return (
                <div
                  key={stat.date}
                  title={`${stat.date} · ${formatNumber(
                    stat.totalCoins
                  )}`}
                  style={{
                    flex: isAll ? "none" : 1,
                    width: isAll ? 8 : "auto",
                    minWidth: isAll ? 8 : 6,
                    height: h,
                    background: "#ffd166",
                    borderRadius: 3,
                    display: isAll ? "inline-block" : "block",
                    transition: "0.2s"
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 상세 리스트 */}
      {dailyStatList.map((stat) => {
        const fullPercent = Math.min(
          (stat.totalSeconds / 86400) * 100,
          100
        );
        const wastePercent = Math.max(
          0,
          100 - fullPercent
        );

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
            <div
              style={{ fontWeight: 700, fontSize: 16 }}
            >
              {stat.date}
            </div>

<div style={{ marginTop: 6 }}>
  Coins: <b>{formatNumber(stat.totalCoins)}</b>
</div>

<div>
  Cells: <b>{formatNumber(stat.totalCells || 0)}</b>
</div>

<div>
  Reroll Shards: <b>{formatNumber(stat.totalReroll || 0)}</b>
</div>


            <div>
              Real Time:{" "}
              <b>{formatTime(stat.totalSeconds)}</b>
            </div>

            {/* 진행률 막대 그래프 */}
            <div style={{ marginTop: 8 }}>
              <ResponsiveContainer
                width="100%"
                height={20}
              >
                <BarChart
                  data={[{ name: "전체", value: fullPercent }]}
                  layout="vertical"
                  margin={{
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0
                  }}
                >
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    hide
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    hide
                  />
                  <Bar
                    dataKey="value"
                    fill="#0077b6"
                    isAnimationActive={false}
                    background={{ fill: "#ddd" }}
                  >
                    <LabelList
                      dataKey="value"
                      position="insideRight"
                      formatter={(v) =>
                        v.toFixed(2) + "%"
                      }
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
              낭비 시간:{" "}
              <b>{wastePercent.toFixed(2)}%</b>
            </div>
          </div>
        );
      })}
    </div>
  );
}
