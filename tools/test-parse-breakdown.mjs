const num = (s) => Number(String(s ?? '').replace(/[^\d]/g, '')) || 0

function parseBreakdownText(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  const pair = (pattern) => {
    const m = t.match(new RegExp(`${pattern}\\s*(\\d[\\d.,]*)\\s*\\/\\s*(\\d[\\d.,]*)`, 'i'))
    return m ? { progress: num(m[1]), max: num(m[2]) } : null
  }
  const one = (label) => {
    const m = t.match(new RegExp(`${label}(?:\\s*Points)?\\s*:?\\s*(\\d[\\d.,]*)`, 'i'))
    return m ? num(m[1]) : null
  }
  const desktop =
    pair('Desktop Bing search') ??
    pair('PC search') ??
    pair('Tìm kiếm trên PC') ??
    pair('(?<!Mobile\\s+)Bing search')

  const mobile =
    pair('Mobile Bing search') ??
    pair('Tìm kiếm trên thiết bị di động') ??
    pair('Mobile search')

  return {
    todayPoints: one("Today's points"),
    desktop,
    mobile,
    offers: one('Offers'),
    month: one('This month'),
    year: one('This year'),
    lifetime: one('Lifetime')
  }
}

const tw = "Today's points Points 3 Today's activity Points Bing search 3/15 Offers 0 History Points This month 0 This year 679 Lifetime 679"
console.log('ĐÀI LOAN:\n', JSON.stringify(parseBreakdownText(tw), null, 2))

const vn = "Points breakdown Today's points 114 Today's activity Points Desktop Bing search 72/90 Mobile Bing search 18/60 Offers 24 History Points This month 596 This year 24,607 Lifetime 24,607 How it works"
console.log('VIỆT NAM:\n', JSON.stringify(parseBreakdownText(vn), null, 2))
