import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import markdownit from 'markdown-it'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(__dirname)

// ===== CLI args =====
//   --input <path>    markdown source (absolute or relative to repo root)
//   --output <path>   html destination (absolute or relative to repo root)
//   --lang <en|zh>    override language (auto-detected from input filename)
//   --version <x.y.z> override version (auto-detected from input filename)
const args = process.argv.slice(2)
function getArg(name) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : null
}

const inputArg = getArg('input')
const outputArg = getArg('output')

if (!inputArg || !outputArg) {
  console.error('Usage: node generate-guidebook-html.js --input <md> --output <html> [--lang en|zh] [--version x.y.z]')
  process.exit(1)
}

const mdPath = path.isAbsolute(inputArg) ? inputArg : path.join(root, inputArg)
const htmlPath = path.isAbsolute(outputArg) ? outputArg : path.join(root, outputArg)

// Auto-detect language and version from filename
const baseName = path.basename(mdPath)
const isZh = baseName.includes('.zh-CN') || getArg('lang') === 'zh'
const lang = getArg('lang') || (isZh ? 'zh' : 'en')
const versionMatch = baseName.match(/_GuideBook_(\d+\.\d+\.\d+)/)
const version = getArg('version') || (versionMatch ? versionMatch[1] : '0.2.2')

const md = markdownit({
  html: true,
  linkify: true,
  typographer: true
})

const mdContent = fs.readFileSync(mdPath, 'utf-8')
const htmlContent = md.render(mdContent)

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5\-]+/g, '')
    .replace(/^-+|-+$/g, '')
}

function addIdsToHeadings(html) {
  let result = html
  const headingRegex = /<(h[23])([^>]*)>([^<]+)<\/\1>/g
  const ids = new Set()

  result = result.replace(headingRegex, (match, tag, attrs, text) => {
    let id = slugify(text)
    let counter = 1
    while (ids.has(id)) {
      id = slugify(text) + '-' + counter++
    }
    ids.add(id)

    if (attrs.includes('id=')) {
      return match
    }

    return `<${tag}${attrs} id="${id}">${text}</${tag}>`
  })

  return { html: result, ids }
}

const { html: htmlWithIds } = addIdsToHeadings(htmlContent)

function buildToc(content) {
  const toc = []
  const h2Regex = /<h2 id="([^"]+)">([^<]+)<\/h2>/g
  const h3Regex = /<h3 id="([^"]+)">([^<]+)<\/h3>/g

  let h2Match
  let currentH2 = null

  while ((h2Match = h2Regex.exec(content)) !== null) {
    currentH2 = { id: h2Match[1], title: h2Match[2] }
    toc.push({ ...currentH2, children: [] })
  }

  if (toc.length > 0) {
    let h3Match
    let h2Index = 0

    while ((h3Match = h3Regex.exec(content)) !== null) {
      const h3Pos = h3Match.index
      let foundH2 = false

      for (let i = h2Index + 1; i < toc.length; i++) {
        const h2Id = toc[i].id
        const h2IndexInContent = content.indexOf(`<h2 id="${h2Id}"`)
        if (h2IndexInContent > h3Pos) {
          h2Index = i - 1
          foundH2 = true
          break
        }
      }

      if (!foundH2 && h2Index < toc.length) {
        toc[h2Index].children.push({ id: h3Match[1], title: h3Match[2] })
      }
    }
  }

  return toc
}

function renderToc(toc, lang) {
  const label = lang === 'zh' ? 'EnvoyMesh 指南' : 'EnvoyMesh Guidebook'
  let html = `<nav class="browser-toc"><strong>${label}</strong>`

  toc.forEach(item => {
    html += `<a class="toc-l2" href="#${item.id}">${item.title}</a>`
    if (item.children.length > 0) {
      item.children.forEach(child => {
        html += `<a class="toc-l3" href="#${child.id}">${child.title}</a>`
      })
    }
  })

  html += '</nav>'
  return html
}

const toc = buildToc(htmlWithIds)
const tocHtml = renderToc(toc, lang)

// Language-specific strings
const strings = lang === 'zh'
  ? {
      htmlLang: 'zh-CN',
      title: `EnvoyMesh 指南 ${version}`,
      subject: '面向终端用户的完整指南与网站内容体系',
      description: 'EnvoyMesh 完整指南：涵盖私聊、个人 AI、外部智能体、智能体网络与协作任务、知识、互操作、安全与运维。',
      edition: '完整指南版',
      tocHeader: 'ENVOYMESH 指南',
      backTop: '回到顶部',
      fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", -apple-system, BlinkMacSystemFont, sans-serif'
    }
  : {
      htmlLang: 'en',
      title: `EnvoyMesh Guidebook ${version}`,
      subject: 'Complete end-user guide and website content system',
      description: 'EnvoyMesh complete guidebook: chat, personal AI, external agents, agent network and collaborative tasks, knowledge, interoperability, security, and operations.',
      edition: 'Complete Guidebook Edition',
      tocHeader: 'ENVOYMESH GUIDEBOOK',
      backTop: 'Back to top',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    }

const header = `<!doctype html><html lang="${strings.htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${strings.title}</title><meta name="author" content="EnvoyMesh"><meta name="subject" content="${strings.subject}"><meta name="description" content="${strings.description}"><style>:root{--page-bg:#f7f7f6;--section-bg:#f0f0ee;--card-bg:#e8e7e2;--header-fill:#645a3a;--cover-block:#6b634d;--border:#d0c9b3;--accent:#3d5a45;--text-primary:#1e1d1b;--text-muted:#6d6a63}
@page{size:A4;margin:18mm 17mm 19mm;@top-left{content:"${strings.tocHeader}";color:#6d6a63;font-size:8.5pt;letter-spacing:.08em}@top-right{content:"${strings.edition}";color:#6d6a63;font-size:8.5pt;letter-spacing:.08em}@bottom-left{content:"Version ${version}";color:#6d6a63;font-size:8pt}@bottom-right{content:counter(page);color:#1e1d1b;font-size:8pt}}
@page:first{margin:0;@top-left{content:none}@top-right{content:none}@bottom-left{content:none}@bottom-right{content:none}}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:var(--page-bg);color:var(--text-primary)}body{font-family:${strings.fontFamily};font-size:10pt;line-height:1.7}
.cover{height:297mm;padding:25mm 23mm 22mm;position:relative;background:var(--page-bg);break-after:page}.cover:before{content:"";position:absolute;left:0;top:0;bottom:0;width:10mm;background:var(--cover-block)}.cover:after{content:"${version}";position:absolute;right:19mm;bottom:16mm;font-size:48pt;font-weight:750;letter-spacing:-.05em;color:var(--border)}
.cover-kicker{margin-top:11mm;color:var(--accent);font-size:10pt;font-weight:750;letter-spacing:.18em;text-transform:uppercase}.cover h1{margin:27mm 0 4mm;max-width:150mm;font-size:44pt;line-height:.98;letter-spacing:-.045em;font-weight:780}.cover .edition{font-size:18pt;color:var(--cover-block);font-weight:600}.cover .rule{width:34mm;height:1.2mm;margin:15mm 0 10mm;background:var(--accent)}.cover .summary{width:130mm;padding:7mm 8mm;background:var(--section-bg);border-left:1.3mm solid var(--header-fill);font-size:12pt;line-height:1.7}.cover .meta{margin-top:12mm;color:var(--text-muted);font-size:9.5pt;line-height:1.65}
.content{max-width:176mm;margin:0 auto}.content>h1:first-child,.content>h1:first-child+p,.content>h1:first-child+p+p,.content>h1:first-child+p+p+p,.content>h1:first-child+p+p+p+p,.content>h1:first-child+p+p+p+p+blockquote{display:none}
h1{font-size:27pt;line-height:1.1;letter-spacing:-.025em;margin:0 0 8mm}h2{font-size:20pt;line-height:1.15;margin:8mm 0 5mm;padding:4mm 0 2.5mm;border-bottom:.6mm solid var(--accent);break-after:avoid;break-before:page}h2:first-of-type{break-before:auto}h3{font-size:14pt;line-height:1.25;margin:7mm 0 3mm;color:var(--cover-block);break-after:avoid}h4{font-size:10.8pt;line-height:1.3;margin:4.8mm 0 1.5mm;color:var(--accent);break-after:avoid}
p{margin:0 0 3.2mm;widows:3;orphans:3;line-height:1.7}blockquote{margin:4mm 0;padding:3mm 4mm;background:var(--section-bg);border-left:1mm solid var(--accent);color:var(--text-muted);break-inside:avoid}ul,ol{margin:2mm 0 4mm 5mm;padding-left:5mm}li{margin:1mm 0;line-height:1.7}
table{width:100%;border-collapse:collapse;margin:4mm auto 6mm;font-size:8.8pt}thead{display:table-header-group}tr{break-inside:avoid}th{color:#fff;background:var(--header-fill);padding:2.4mm;text-align:left}td{padding:2.2mm;border-bottom:.25mm solid var(--border);vertical-align:top;line-height:1.5}hr{border:0;border-top:.35mm solid var(--border);margin:7mm 0}
strong{font-weight:720}code{font-family:"SFMono-Regular",Consolas,monospace;font-size:.92em;background:var(--section-bg);padding:.2mm .8mm;border-radius:1mm;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--section-bg);padding:3mm;border-left:.8mm solid var(--border);break-inside:avoid}
a{color:var(--accent);text-decoration:none}figure{display:block;width:100%;margin:2.5em auto;break-inside:avoid}figure svg{width:100%;height:auto}figcaption{text-align:center;font-size:9pt;color:var(--text-muted);margin-top:0.6em}
.browser-toc{display:none}.back-top{display:none}
@media screen{html{background:#d9d8d4}.browser-toc{display:block;position:fixed;left:0;top:0;bottom:0;width:270px;overflow:auto;padding:18px 15px;background:#f0f0ee;border-right:1px solid var(--border);z-index:10}.browser-toc strong{display:block;margin-bottom:12px}.browser-toc a{display:block;padding:4px 5px;font-size:12px}.browser-toc .toc-l3{padding-left:17px;color:var(--text-muted)}body{width:210mm;margin:0 auto 0 calc(270px + (100vw - 270px - 210mm)/2);box-shadow:0 0 22px rgba(0,0,0,.14)}.back-top{display:block;position:fixed;right:16px;bottom:16px;background:var(--header-fill);color:white;padding:8px 11px;border-radius:4px;z-index:12}}
@media screen and (max-width:1100px){.browser-toc{display:none}body{margin:0 auto}.back-top{display:block}}@media print{.browser-toc,.back-top{display:none}}</style></head><body id="top">`

const footer = `<a href="#top" class="back-top">${strings.backTop}</a></body></html>`

const fullHtml = header + tocHtml + '<div class="content">' + htmlWithIds + '</div>' + footer

fs.writeFileSync(htmlPath, fullHtml, 'utf-8')
console.log(`Generated ${htmlPath}`)
console.log(`Language: ${lang} · Version: ${version}`)
console.log(`TOC entries: ${toc.length} sections`)
