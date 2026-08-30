#!/usr/bin/env python3
"""Compose tall EN/ZH EnvoyMesh share images (body copy + real store QRs)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SCREENS = ROOT / "sites" / "screens"
LOGO = ROOT / "apps" / "social" / "src" / "assets" / "logo-180.png"
QR_APP = SCREENS / "app-store-qr.png"
QR_PLAY = SCREENS / "google-play-qr.png"

W = 1080
MARGIN = 64
CONTENT_W = W - 2 * MARGIN
BG = (11, 17, 32)
CARD = (22, 30, 48)
WHITE = (245, 247, 250)
MUTED = (168, 178, 196)
ACCENT = (255, 140, 66)
CYAN = (80, 210, 230)

FONT_ZH = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FONT_EN = "/System/Library/Fonts/Helvetica.ttc"
PING = "/System/Library/AssetsV2/com_apple_MobileAsset_Font7/3419f2a427639ad8c8e139149a287865a90fa17e.asset/AssetData/PingFang.ttc"


def font(size: int, *, bold: bool = False, zh: bool = False) -> ImageFont.FreeTypeFont:
  if zh:
    for path, idx in ((PING, 0), (FONT_ZH, 0 if not bold else 1), (FONT_ZH, 0)):
      try:
        return ImageFont.truetype(path, size, index=idx)
      except OSError:
        continue
  try:
    return ImageFont.truetype(FONT_EN, size, index=1 if bold else 0)
  except OSError:
    return ImageFont.truetype(FONT_ZH, size, index=0)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont, max_w: int) -> list[str]:
  """Wrap by spaces for Latin; by character for CJK-heavy lines."""
  if not text:
    return [""]
  if text.count(" ") >= max(2, len(text) // 40):
    words = text.split(" ")
    lines: list[str] = []
    cur = ""
    for word in words:
      trial = word if not cur else f"{cur} {word}"
      if draw.textlength(trial, font=fnt) <= max_w:
        cur = trial
      else:
        if cur:
          lines.append(cur)
        cur = word
    if cur:
      lines.append(cur)
    return lines or [""]

  lines = []
  cur = ""
  for ch in text:
    trial = cur + ch
    if draw.textlength(trial, font=fnt) <= max_w:
      cur = trial
    else:
      if cur:
        lines.append(cur)
      cur = ch
  if cur:
    lines.append(cur)
  return lines or [""]


def text_block(
  draw: ImageDraw.ImageDraw,
  y: int,
  text: str,
  fnt: ImageFont.ImageFont,
  fill: tuple[int, int, int],
  *,
  line_gap: int = 10,
  align: str = "left",
) -> int:
  lines = wrap_text(draw, text, fnt, CONTENT_W)
  for line in lines:
    bbox = fnt.getbbox(line)
    h = bbox[3] - bbox[1]
    x = MARGIN
    if align == "center":
      x = (W - int(draw.textlength(line, font=fnt))) // 2
    draw.text((x, y), line, font=fnt, fill=fill)
    y += h + line_gap
  return y


def rounded_rect(
  img: Image.Image,
  box: tuple[int, int, int, int],
  radius: int,
  fill: tuple[int, int, int],
  outline: tuple[int, int, int] | None = None,
  width: int = 2,
) -> None:
  overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
  d = ImageDraw.Draw(overlay)
  d.rounded_rectangle(box, radius=radius, fill=fill + (255,), outline=outline, width=width)
  img.alpha_composite(overlay)


def compose(locale: str) -> Path:
  zh = locale == "zh"
  title = "EnvoyMesh — 代表你的 Envoy（特使）" if zh else "EnvoyMesh — an Envoy that stands for you"
  body = (
    "Envoy 的本意是「特使」——被派出去代表你办事。产品真正的目标是：一台能替你行动的 AI 机器人 / 智能体网络，按你的请求与意图工作。EnvoyMesh 是这些特使栖身的私人点对点网络。路线图指向更完整的 AI 机器人与 Agent Network——由你掌控，而不是「聊天软件再挂个 AI」。"
    if zh
    else "Envoy means a representative sent to act on your behalf. That is the product’s target: an AI robot / agent network that can stand for you — work from your requests and intents. EnvoyMesh is the private peer-to-peer fabric those envoys live on. The roadmap is a fuller AI robot + Agent Network you control — not a chat app with AI bolted on."
  )
  today = "今天已经可以：" if zh else "Today you can already:"
  highlights_title = "几个重点" if zh else "Highlights"
  bullets = (
    [
      "用手机 App EnvoyGo，随时随地连回家里的电脑与 Agent——无需公网 IP；数据留在你的电脑上，隐私安全。",
      "内置小龙虾 OpenClaw；也可通过 Ext Agent 使用 Hermes、OpenHuman、Codex、MiniMax 等。",
      "家人安装 EnvoyGo、扫码配对，即可共享家里的 Agent；每位成员数据隔离——这就是你的 Family Network。",
      "面向开发者：Terminal 可在 EnvoyGo 上直连电脑终端，运行任意 coding agent；聊天里还内置 Envoy Harness 与 Pi，Ext Agent 亦可接 Codex、Claude Code 等。",
      "通信与社交：在 P2P 网格结识新朋友、分享信息——数据始终在你电脑上，安全可控。",
    ]
    if zh
    else [
      "With the EnvoyGo phone app, reach your home computer and agents anywhere — no public IP. Your data stays on your machine, private and secure.",
      "OpenClaw is built in; via Ext Agent you can also use Hermes, OpenHuman, Codex, MiniMax, and more.",
      "Family installs EnvoyGo, scans to pair, and shares the household agent — each member’s data stays isolated. That’s your Family Network.",
      "For developers: Terminal on EnvoyGo opens your computer’s shell for any coding agent. In chat you also get built-in Envoy Harness and Pi, plus Ext Agent options like Codex and Claude Code.",
      "Social over the P2P mesh — meet people and share info; your data stays on your computer, always under your control.",
    ]
  )
  site_url = "https://www.homeclaw.cn/envoy"
  dmg_url = "https://gpt4people.online/EnvoyMesh/envoymesh-desktop.dmg"
  exe_url = "https://gpt4people.online/EnvoyMesh/envoymesh-desktop.exe"
  apk_url = "https://gpt4people.online/EnvoyMesh/envoygo-android.apk"
  links_title = "下载桌面端 / APK" if zh else "Desktop & APK downloads"
  # (label, url) — label muted, URL cyan (website is shown separately at top)
  link_rows: list[tuple[str, str]] = (
    [
      ("Mac", dmg_url),
      ("Windows", exe_url),
      ("Android APK", apk_url),
    ]
    if zh
    else [
      ("Mac", dmg_url),
      ("Windows", exe_url),
      ("Android APK", apk_url),
    ]
  )
  qr_title = "下载 EnvoyGo 手机端" if zh else "Download EnvoyGo (phone)"
  qr_hint = (
    "扫下方二维码（App Store / Google Play）；无 Play 可用上方 APK 链接"
    if zh
    else "Scan QR codes (App Store / Google Play); use the APK link above if needed"
  )

  f_title = font(42, bold=True, zh=zh)
  f_body = font(28, zh=zh)
  f_sec = font(30, bold=True, zh=zh)
  f_bullet = font(26, zh=zh)
  f_small = font(22, zh=zh)
  f_link = font(28, zh=zh)  # download / website URLs — larger for readability
  f_brand = font(52, bold=True, zh=False)
  qr_size = 280

  def draw_highlights(d: ImageDraw.ImageDraw, start_y: int, *, paint: bool) -> int:
    yy = start_y
    if paint:
      yy = text_block(d, yy, today, f_sec, WHITE, line_gap=10)
    else:
      for line in wrap_text(d, today, f_sec, CONTENT_W):
        yy += (f_sec.getbbox(line)[3] - f_sec.getbbox(line)[1]) + 10
    yy += 6
    if paint:
      yy = text_block(d, yy, highlights_title, f_sec, ACCENT, line_gap=10)
    else:
      for line in wrap_text(d, highlights_title, f_sec, CONTENT_W):
        yy += (f_sec.getbbox(line)[3] - f_sec.getbbox(line)[1]) + 10
    yy += 10
    for i, b in enumerate(bullets, 1):
      line_text = f"{i})  {b}"
      if paint:
        yy = text_block(d, yy, line_text, f_bullet, WHITE, line_gap=10)
      else:
        for line in wrap_text(d, line_text, f_bullet, CONTENT_W):
          yy += (f_bullet.getbbox(line)[3] - f_bullet.getbbox(line)[1]) + 10
      yy += 14
    return yy

  def measure_labeled_url(d: ImageDraw.ImageDraw, label: str, url: str, fnt: ImageFont.ImageFont) -> int:
    """Height for 'Label: url' with wrapping on the URL portion."""
    sep = "：" if zh else ": "
    prefix = f"{label}{sep}"
    prefix_w = d.textlength(prefix, font=fnt)
    url_w = CONTENT_W - 24 - prefix_w
    if url_w < 120:
      # Stack: label on first line, URL wrapped below
      h = (fnt.getbbox(prefix)[3] - fnt.getbbox(prefix)[1]) + 6
      for line in wrap_text(d, url, fnt, CONTENT_W - 24):
        h += (fnt.getbbox(line)[3] - fnt.getbbox(line)[1]) + 6
      return h
    # First line may hold prefix + part of URL
    lines = wrap_text(d, url, fnt, int(url_w))
    h = 0
    for i, line in enumerate(lines):
      # first line uses same line height as prefix
      h += (fnt.getbbox(line if i else prefix + line)[3] - fnt.getbbox(line if i else prefix + line)[1]) + 6
    return h

  def draw_labeled_url(
    d: ImageDraw.ImageDraw,
    y0: int,
    label: str,
    url: str,
    fnt: ImageFont.ImageFont,
  ) -> int:
    sep = "：" if zh else ": "
    prefix = f"{label}{sep}"
    x0 = MARGIN + 8
    max_w = CONTENT_W - 24
    prefix_w = d.textlength(prefix, font=fnt)
    url_w = max_w - prefix_w
    line_h = fnt.getbbox("Ag")[3] - fnt.getbbox("Ag")[1]

    if url_w < 120:
      d.text((x0, y0), prefix, font=fnt, fill=MUTED)
      y1 = y0 + line_h + 6
      for line in wrap_text(d, url, fnt, max_w):
        d.text((x0, y1), line, font=fnt, fill=CYAN)
        y1 += line_h + 6
      return y1

    # Put as much URL as fits after prefix on line 1
    words = url  # wrap by char for long URLs without spaces
    first = ""
    rest = url
    for i in range(1, len(url) + 1):
      trial = url[:i]
      if d.textlength(trial, font=fnt) <= url_w:
        first = trial
        rest = url[i:]
      else:
        break
    d.text((x0, y0), prefix, font=fnt, fill=MUTED)
    d.text((x0 + prefix_w, y0), first, font=fnt, fill=CYAN)
    y1 = y0 + line_h + 6
    if rest:
      for line in wrap_text(d, rest, fnt, max_w):
        d.text((x0, y1), line, font=fnt, fill=CYAN)
        y1 += line_h + 6
    return y1

  # Measure
  scratch = Image.new("RGB", (W, 6000), BG)
  draw = ImageDraw.Draw(scratch)
  y = 56 + 160 + 24
  for line in wrap_text(draw, "EnvoyMesh", f_brand, CONTENT_W):
    y += (f_brand.getbbox(line)[3] - f_brand.getbbox(line)[1]) + 8
  y += 12
  title_lines = wrap_text(draw, title, f_title, CONTENT_W - 40)
  title_h = sum((f_title.getbbox(l)[3] - f_title.getbbox(l)[1]) + 8 for l in title_lines) + 28
  y += title_h + 28
  # Website pill under title
  site_h = (f_link.getbbox(site_url)[3] - f_link.getbbox(site_url)[1]) + 32
  y += site_h + 20
  for line in wrap_text(draw, body, f_body, CONTENT_W):
    y += (f_body.getbbox(line)[3] - f_body.getbbox(line)[1]) + 12
  y += 28
  y = draw_highlights(draw, y, paint=False)
  y += 20
  for line in wrap_text(draw, links_title, f_sec, CONTENT_W):
    y += (f_sec.getbbox(line)[3] - f_sec.getbbox(line)[1]) + 8
  y += 8
  for label, url in link_rows:
    y += measure_labeled_url(draw, label, url, f_link) + 10
  y += 20 + 28
  for line in wrap_text(draw, qr_title, f_sec, CONTENT_W):
    y += (f_sec.getbbox(line)[3] - f_sec.getbbox(line)[1]) + 8
  for line in wrap_text(draw, qr_hint, f_small, CONTENT_W):
    y += (f_small.getbbox(line)[3] - f_small.getbbox(line)[1]) + 8
  y += 16 + qr_size + 14 + 36
  total_h = y + 64

  img = Image.new("RGBA", (W, total_h), BG + (255,))
  draw = ImageDraw.Draw(img)

  y = 56
  logo = Image.open(LOGO).convert("RGBA").resize((160, 160), Image.Resampling.LANCZOS)
  img.paste(logo, ((W - 160) // 2, y), logo)
  y += 160 + 24

  y = text_block(draw, y, "EnvoyMesh", f_brand, WHITE, align="center", line_gap=8)
  y += 12

  pill_box = (MARGIN, y, W - MARGIN, y + title_h)
  rounded_rect(img, pill_box, 18, CARD, outline=ACCENT, width=3)
  draw = ImageDraw.Draw(img)
  ty = y + 16
  for line in title_lines:
    x = (W - int(draw.textlength(line, font=f_title))) // 2
    draw.text((x, ty), line, font=f_title, fill=WHITE)
    ty += (f_title.getbbox(line)[3] - f_title.getbbox(line)[1]) + 8
  y = pill_box[3] + 16

  # Website at top (not mixed with download rows)
  site_box = (MARGIN + 24, y, W - MARGIN - 24, y + site_h)
  rounded_rect(img, site_box, 16, CARD, outline=CYAN, width=2)
  draw = ImageDraw.Draw(img)
  sx = (W - int(draw.textlength(site_url, font=f_link))) // 2
  sy = y + (site_h - (f_link.getbbox(site_url)[3] - f_link.getbbox(site_url)[1])) // 2 - 2
  draw.text((sx, sy), site_url, font=f_link, fill=CYAN)
  y = site_box[3] + 24

  y = text_block(draw, y, body, f_body, MUTED, line_gap=12)
  y += 28
  y = draw_highlights(draw, y, paint=True)

  y += 20
  # Label muted, URL cyan — larger link font
  link_h = 28
  for line in wrap_text(draw, links_title, f_sec, CONTENT_W):
    link_h += (f_sec.getbbox(line)[3] - f_sec.getbbox(line)[1]) + 8
  link_h += 8
  for label, url in link_rows:
    link_h += measure_labeled_url(draw, label, url, f_link) + 10
  link_h += 16
  link_box = (MARGIN - 8, y, W - MARGIN + 8, y + link_h)
  rounded_rect(img, link_box, 20, CARD, outline=(60, 72, 96), width=2)
  draw = ImageDraw.Draw(img)
  ly = y + 20
  ly = text_block(draw, ly, links_title, f_sec, WHITE, align="center", line_gap=8)
  ly += 8
  for label, url in link_rows:
    ly = draw_labeled_url(draw, ly, label, url, f_link)
    ly += 10
  y = link_box[3] + 20

  card_top = y
  title_block_h = 0
  for line in wrap_text(draw, qr_title, f_sec, CONTENT_W):
    title_block_h += (f_sec.getbbox(line)[3] - f_sec.getbbox(line)[1]) + 8
  for line in wrap_text(draw, qr_hint, f_small, CONTENT_W):
    title_block_h += (f_small.getbbox(line)[3] - f_small.getbbox(line)[1]) + 8
  card_bottom = y + 28 + title_block_h + 16 + qr_size + 14 + 36 + 28
  rounded_rect(
    img,
    (MARGIN - 8, card_top, W - MARGIN + 8, card_bottom),
    24,
    CARD,
    outline=(60, 72, 96),
    width=2,
  )
  draw = ImageDraw.Draw(img)

  y = card_top + 28
  y = text_block(draw, y, qr_title, f_sec, WHITE, align="center", line_gap=8)
  y = text_block(draw, y, qr_hint, f_small, MUTED, align="center", line_gap=8)
  y += 16

  qr_app = Image.open(QR_APP).convert("RGBA").resize((qr_size, qr_size), Image.Resampling.LANCZOS)
  qr_play = Image.open(QR_PLAY).convert("RGBA").resize((qr_size, qr_size), Image.Resampling.LANCZOS)
  gap = 48
  total_qr_w = qr_size * 2 + gap
  qx0 = (W - total_qr_w) // 2
  pad = 12
  for qx, qr in ((qx0, qr_app), (qx0 + qr_size + gap, qr_play)):
    pad_box = (qx - pad, y - pad, qx + qr_size + pad, y + qr_size + pad)
    rounded_rect(img, pad_box, 12, (255, 255, 255), outline=None)
    img.paste(qr, (qx, y), qr)
  draw = ImageDraw.Draw(img)
  label_y = y + qr_size + 14
  for qx, label in ((qx0, "App Store"), (qx0 + qr_size + gap, "Google Play")):
    lx = qx + (qr_size - int(draw.textlength(label, font=f_small))) // 2
    draw.text((lx, label_y), label, font=f_small, fill=MUTED)

  out = SCREENS / f"envoymesh-social-share-long-{locale}.png"
  img.convert("RGB").save(out, "PNG", optimize=True)
  print(f"Wrote {out} ({W}x{img.height})")
  return out


def main() -> None:
  compose("zh")
  compose("en")


if __name__ == "__main__":
  main()
