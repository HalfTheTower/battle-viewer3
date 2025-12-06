// 숫자 + 단위 변환
export function parseNumber(val) {
  if (!val) return 0;

  const units = {
    "K": 1e3,
    "M": 1e6,
    "B": 1e9,
    "T": 1e12,
    "q": 1e15,
    "Q": 1e18,
    "s": 1e21,
    "S": 1e24,
    "O": 1e27,
    "N": 1e30,
    "D": 1e33,
    "aa": 1e36,
    "ab": 1e39,
    "ac": 1e42,
  };

  const regex = /^([0-9.]+)([a-zA-Z]+)$/;
  const match = val.match(regex);

  if (!match) return Number(val) || 0;

  const num = parseFloat(match[1]);
  const unit = match[2];

  return num * (units[unit] || 1);
}

// 숫자를 단위 붙여서 문자열로 변환
export function formatNumber(num) {
  const units = [
    { value: 1e42, symbol: "ac" },
    { value: 1e39, symbol: "ab" },
    { value: 1e36, symbol: "aa" },
    { value: 1e33, symbol: "D" },
    { value: 1e30, symbol: "N" },
    { value: 1e27, symbol: "O" },
    { value: 1e24, symbol: "S" },
    { value: 1e21, symbol: "s" },
    { value: 1e18, symbol: "Q" },
    { value: 1e15, symbol: "q" },
    { value: 1e12, symbol: "T" },
    { value: 1e9, symbol: "B" },
    { value: 1e6, symbol: "M" },
    { value: 1e3, symbol: "K" },
  ];

  for (let i = 0; i < units.length; i++) {
    if (num >= units[i].value) {
      return (num / units[i].value).toFixed(2) + units[i].symbol;
    }
  }
  return num.toString();
}
