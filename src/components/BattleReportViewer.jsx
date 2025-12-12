// components/BattleReportViewer.jsx
import { TAB_COLORS, KILLED_BY_COLORS, KILLED_BY_SHAPES, KILLED_BY_LABELS } from "../battleConstants";

const indexLabel = (n) => `#${n}`;


const renderKillShape = (type) => {
  const color = KILLED_BY_COLORS[type] || "#d9534f";
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

export default function BattleReportViewer({
  savedList,
  filterType,
  isMobile,
  openMemos,
  setOpenMemos,
  lastItemRef,
  extractSummary,
  extractTierWave,
  formatBattleDate,
  extractTime,
  onClickItem,
}) {
  return (
    <div style={{ marginTop: 16 }}>
      {savedList
        .filter((r) => {
          if (filterType === "전체") return true;
          if (filterType === "낭비") {
            return !["파밍", "토너", "등반", "리롤"].includes(r.type);
          }
          return r.type === filterType;
        })
        .map((item, idx, arr) => {
          const raw = item.raw;
          const timeLine =
            raw.split("\n").find((l) => l.includes("Real Time")) || "";
          const { h, m, s } = extractTime(timeLine);
          const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(
            2,
            "0"
          )}:${String(s).padStart(2, "0")}`;

          return (
            <div
              key={item.id}
              ref={idx === arr.length - 1 ? lastItemRef : null}
              onClick={() => onClickItem(item)}
              style={{
                padding: 12,
                borderRadius: 10,
                background: TAB_COLORS[item.type] + "22",
                marginBottom: 10,
                cursor: "pointer",
              }}
            >
              {/* 첫 줄: 번호 + 날짜 + KillBadge + Tier/Wave + 시간 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontWeight: 700,
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                {/* 왼쪽: ① + 날짜 + [아이콘] Ray */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {/* 번호 */}
                  <span style={{ fontSize:14}}>{indexLabel(idx + 1)}
                  </span>

                  {/* 날짜 (조금 작게) */}
                  <span style={{ fontSize: 12, color: "#949494ff" }}>
                    {formatBattleDate(item.raw)}
                  </span>

                  {/* Kill Badge */}
                  {(() => {
                    const line = item.raw
                      .split("\n")
                      .find((l) => l.startsWith("Killed By"));
                    if (!line) return null;

                    const killedBy = line.split("\t")[1]?.trim();
                    if (!killedBy) return null;

                    return (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 6px",
                          borderRadius: 6,
                          background:
                            (KILLED_BY_COLORS[killedBy] || "#ffd6d6") + "44",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {renderKillShape(killedBy)}
                        {KILLED_BY_LABELS[killedBy] || killedBy}
                      </span>
                    );
                  })()}
                </div>

                {/* 오른쪽: Tier/Wave + 시간 */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "#0053cfff" }}>
                    {extractTierWave(item.raw)}
                  </span>
                  <span style={{ fontSize: 12, color: "#666" }}>
                    ⏱ {timeStr}
                  </span>
                </div>
              </div>

              {/* 요약 (Killed By + 코인/셀 + 딜비율) */}
              <div style={{ marginTop: 6 }}>{extractSummary(item.raw)}</div>

              {/* 메모 */}
              {item.memo &&
                (() => {
                  const isOpen = openMemos[item.id];
                  const lineCount = item.memo.split("\n").length;
                  const isLong = lineCount > 3;

                  return (
                    <div style={{ marginTop: 6 }}>
                      <div
                        style={{
                          padding: "6px 8px",
                          background: "rgba(255, 255, 255, 0.95)",
                          borderRadius: 6,
                          fontSize: 13,
                          color: "#686868e5",
                          fontStyle: "italic",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          lineHeight: 1.4,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: !isOpen && isLong ? 3 : 999,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {item.memo}
                      </div>

                      {isLong && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMemos((prev) => ({
                              ...prev,
                              [item.id]: !prev[item.id],
                            }));
                          }}
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#0077b6",
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          {isOpen ? "접기 ▲" : "더보기 ▶"}
                        </div>
                      )}
                    </div>
                  );
                })()}
            </div>
          );
        })}
    </div>
  );
}
