// Do trinh duyet co tren may: doc tu registry App Paths + cac duong dan quen thuoc,
// lay them version. Chi trinh duyet nhan Chromium moi dung duoc cho automation (CDP + user-data-dir).
import { execFile } from 'node:child_process'

export type DetectedBrowser = {
  id: string
  name: string
  exe: string
  version: string | null
  /** nhan Chromium => dung duoc (CDP, --user-data-dir) */
  chromium: boolean
  /** Windows tu gan tai khoan Microsoft vao profile moi (chi Edge) */
  autoSignInRisk: boolean
}

const KNOWN: { id: string; name: string; exe: string; chromium: boolean; autoSignInRisk: boolean }[] = [
  { id: 'msedge', name: 'Microsoft Edge', exe: 'msedge.exe', chromium: true, autoSignInRisk: true },
  { id: 'chrome', name: 'Google Chrome', exe: 'chrome.exe', chromium: true, autoSignInRisk: false },
  { id: 'brave', name: 'Brave', exe: 'brave.exe', chromium: true, autoSignInRisk: false },
  { id: 'coccoc', name: 'Cốc Cốc', exe: 'browser.exe', chromium: true, autoSignInRisk: false },
  { id: 'vivaldi', name: 'Vivaldi', exe: 'vivaldi.exe', chromium: true, autoSignInRisk: false },
  { id: 'opera', name: 'Opera', exe: 'opera.exe', chromium: true, autoSignInRisk: false },
  { id: 'chromium', name: 'Chromium', exe: 'chromium.exe', chromium: true, autoSignInRisk: false },
  { id: 'firefox', name: 'Mozilla Firefox', exe: 'firefox.exe', chromium: false, autoSignInRisk: false }
]

const EXTRA_PATHS: Record<string, string[]> = {
  msedge: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge Beta\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge Dev\\Application\\msedge.exe'
  ],
  chrome: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome Beta\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome Dev\\Application\\chrome.exe'
  ],
  brave: [
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
  ],
  coccoc: ['C:\\Program Files\\CocCoc\\Browser\\Application\\browser.exe', 'C:\\Program Files (x86)\\CocCoc\\Browser\\Application\\browser.exe'],
  vivaldi: ['C:\\Program Files\\Vivaldi\\Application\\vivaldi.exe', 'C:\\Program Files (x86)\\Vivaldi\\Application\\vivaldi.exe'],
  opera: [
    'C:\\Program Files\\Opera\\launcher.exe',
    'C:\\Program Files (x86)\\Opera\\launcher.exe',
    'C:\\Users\\%USER%\\AppData\\Local\\Programs\\Opera\\launcher.exe'
  ],
  chromium: ['C:\\Program Files\\Chromium\\Application\\chrome.exe'],
  firefox: ['C:\\Program Files\\Mozilla Firefox\\firefox.exe', 'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe']
}

const PS_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$names = @('msedge.exe','chrome.exe','brave.exe','browser.exe','vivaldi.exe','launcher.exe','chromium.exe','firefox.exe')
$paths = New-Object System.Collections.Generic.HashSet[string]
foreach ($root in @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths')) {
  foreach ($n in $names) {
    $k = Join-Path $root $n
    if (Test-Path $k) {
      $p = (Get-ItemProperty -Path $k).'(default)'
      if ($p) { [void]$paths.Add($p.Trim('"')) }
    }
  }
}
$out = @()
foreach ($p in $paths) {
  if (Test-Path $p) {
    $vi = (Get-Item $p).VersionInfo
    $out += [pscustomobject]@{ path = $p; version = $vi.ProductVersion; name = $vi.ProductName }
  }
}
$out | ConvertTo-Json -Compress
`

let cache: DetectedBrowser[] | null = null

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (_err, stdout) => resolve(stdout || '')
    )
  })
}

export async function detectBrowsers(force = false): Promise<DetectedBrowser[]> {
  if (cache && !force) return cache
  const fs = await import('node:fs')

  // 1) registry App Paths
  const raw = await runPowerShell(PS_SCRIPT)
  let fromRegistry: { path: string; version?: string }[] = []
  try {
    const parsed = JSON.parse(raw.trim() || '[]')
    fromRegistry = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    fromRegistry = []
  }

  const candidates = new Map<string, string>() // exe path -> id
  for (const k of KNOWN) {
    for (const p of EXTRA_PATHS[k.id] ?? []) {
      const resolved = p.replace('%USER%', process.env.USERNAME ?? '')
      if (fs.existsSync(resolved)) candidates.set(resolved, k.id)
    }
  }
  for (const r of fromRegistry) {
    if (!r?.path) continue
    const lower = r.path.toLowerCase()
    const found = KNOWN.find((k) => lower.endsWith(`\\${k.exe}`) || lower.endsWith(k.exe))
    if (found && fs.existsSync(r.path)) candidates.set(r.path, found.id)
  }

  const versionOf = (p: string): string | null => {
    const hit = fromRegistry.find((r) => r.path?.toLowerCase() === p.toLowerCase())
    return hit?.version ?? null
  }

  const out: DetectedBrowser[] = []
  for (const [exe, id] of candidates) {
    const meta = KNOWN.find((k) => k.id === id)
    if (!meta) continue
    out.push({
      id,
      name: meta.name,
      exe,
      version: versionOf(exe),
      chromium: meta.chromium,
      autoSignInRisk: meta.autoSignInRisk
    })
  }
  // Sap xep: Edge truoc, Chrome sau, roi cac loai khac
  const order = ['msedge', 'chrome', 'brave', 'coccoc', 'vivaldi', 'opera', 'chromium', 'firefox']
  out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id) || a.exe.localeCompare(b.exe))
  cache = out
  return out
}

/** Duong dan exe cua browser theo id (uu tien ban da do duoc). */
export async function exeFor(id: string): Promise<string | null> {
  const list = await detectBrowsers()
  return list.find((b) => b.id === id && b.chromium)?.exe ?? null
}

/** Ban dong bo: doc tu cache da do truoc do (goi detectBrowsers() luc mo app). */
export function exeForCached(id: string): string | null {
  return cache?.find((b) => b.id === id && b.chromium)?.exe ?? null
}
