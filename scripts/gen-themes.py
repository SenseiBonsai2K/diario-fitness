# Theme pairs: background family + accent. Generates CSS and checks WCAG contrast.
import colorsys, json, sys

def hx(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def lum(c):
    def ch(v):
        v/=255; return v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4
    r,g,b=map(ch,c); return 0.2126*r+0.7152*g+0.0722*b
def cr(a,b):
    la,lb=lum(hx(a)),lum(hx(b)); la,lb=max(la,lb),min(la,lb); return (la+0.05)/(lb+0.05)

# Each theme: light {bg, surface, raised, line, ink, muted, accent, accentInk, accentSoft, hero, heroAccent}
#             dark  {same}
T = {
 "classic": dict(
   light=dict(bg="#F2F3F0", surface="#FFFFFF", raised="#EAECE8", line="#D9DDD8", ink="#1A211F", muted="#5E6763", accent="#2B4FCF", accentInk="#FFFFFF", accentSoft="#E3E8FA", hero="#161C2E", heroAccent="#A8BEFF"),
   dark=dict(bg="#121615", surface="#1A1F1E", raised="#242A28", line="#2D3432", ink="#E7EBE8", muted="#9AA39F", accent="#8EA6FF", accentInk="#0E1430", accentSoft="#232B47", hero="#28325C", heroAccent="#B2C6FF")),
 "sand": dict(  # Sabbia e terracotta
   light=dict(bg="#F5F0E8", surface="#FFFDF9", raised="#EDE6DA", line="#E0D6C6", ink="#2A211A", muted="#6E6255", accent="#B0461F", accentInk="#FFFFFF", accentSoft="#F7E3D8", hero="#3A2218", heroAccent="#FFB48F"),
   dark=dict(bg="#17130F", surface="#211B16", raised="#2C251E", line="#3A3128", ink="#EFE8DF", muted="#AFA393", accent="#F08A5D", accentInk="#2A1004", accentSoft="#3E2619", hero="#4A2A1C", heroAccent="#FFC2A3")),
 "sage": dict(  # Salvia e petrolio
   light=dict(bg="#EEF3F1", surface="#FFFFFF", raised="#E2EBE8", line="#D2DEDA", ink="#16211F", muted="#566764", accent="#0B6E6E", accentInk="#FFFFFF", accentSoft="#D7EEEC", hero="#0F2A2B", heroAccent="#7FE0D6"),
   dark=dict(bg="#0F1514", surface="#172020", raised="#202B2A", line="#2A3736", ink="#E4EEEC", muted="#93A6A3", accent="#4FD1C5", accentInk="#032321", accentSoft="#183634", hero="#14403F", heroAccent="#9AF0E7")),
 "lavender": dict(  # Lavanda e viola
   light=dict(bg="#F3F1F8", surface="#FFFFFF", raised="#E9E5F2", line="#DAD4E8", ink="#1F1A2B", muted="#625C73", accent="#6236C9", accentInk="#FFFFFF", accentSoft="#ECE4FB", hero="#221A3D", heroAccent="#C7B2FF"),
   dark=dict(bg="#13111A", surface="#1C1926", raised="#262233", line="#322D42", ink="#ECE9F4", muted="#A39DB5", accent="#B49BFF", accentInk="#1D0F45", accentSoft="#2E2550", hero="#33285E", heroAccent="#D4C4FF")),
 "blush": dict(  # Cipria e lampone
   light=dict(bg="#F8F1F2", surface="#FFFFFF", raised="#F0E5E7", line="#E5D6D9", ink="#2A1A1E", muted="#715C61", accent="#B0265A", accentInk="#FFFFFF", accentSoft="#F9E0E9", hero="#3A1424", heroAccent="#FFA6C6"),
   dark=dict(bg="#171013", surface="#21171B", raised="#2D2025", line="#3B2B31", ink="#F2E8EB", muted="#B39DA4", accent="#FF7FAE", accentInk="#3A0619", accentSoft="#43202E", hero="#4E1A30", heroAccent="#FFB8D2")),
 "graphite": dict(  # Grafite e arancio
   light=dict(bg="#F1F1F2", surface="#FFFFFF", raised="#E6E7E9", line="#D7D8DB", ink="#18191C", muted="#5D6068", accent="#B54708", accentInk="#FFFFFF", accentSoft="#FCE7D6", hero="#1C1D21", heroAccent="#FFB066"),
   dark=dict(bg="#0E0F11", surface="#17181B", raised="#212226", line="#2C2D32", ink="#ECECEE", muted="#9C9EA6", accent="#FF9A3D", accentInk="#2B1300", accentSoft="#3A2716", hero="#2A2B31", heroAccent="#FFBE80")),
 "forest": dict(  # Bosco e lime (dark-friendly sporty)
   light=dict(bg="#F0F3EC", surface="#FFFFFF", raised="#E5EADF", line="#D5DCCC", ink="#1A2116", muted="#5C6655", accent="#3F6A12", accentInk="#FFFFFF", accentSoft="#E3EFD3", hero="#1A2614", heroAccent="#C4F06A"),
   dark=dict(bg="#0F130D", surface="#171D14", raised="#20281C", line="#2B3526", ink="#E9EFE3", muted="#9AA690", accent="#B5E85A", accentInk="#1A2604", accentSoft="#2A3A18", hero="#253A16", heroAccent="#D2F78C")),
 "ocean": dict(  # Ghiaccio e blu notte
   light=dict(bg="#EEF2F7", surface="#FFFFFF", raised="#E2E8F0", line="#D2DAE5", ink="#141C28", muted="#566275", accent="#0B5CAD", accentInk="#FFFFFF", accentSoft="#DCEAF9", hero="#0E1D33", heroAccent="#8CC8FF"),
   dark=dict(bg="#0C1118", surface="#141B25", raised="#1D2633", line="#283342", ink="#E6EDF6", muted="#94A3B8", accent="#5AB0FF", accentInk="#03203D", accentSoft="#16304D", hero="#15325A", heroAccent="#A9D6FF")),
}

ok=True
for name,t in T.items():
    for mode,c in t.items():
        checks = {
          "ink/bg": cr(c["ink"],c["bg"]), "muted/surface": cr(c["muted"],c["surface"]), "muted/bg": cr(c["muted"],c["bg"]),
          "accent/surface": cr(c["accent"],c["surface"]), "accent/bg": cr(c["accent"],c["bg"]),
          "accentInk/accent": cr(c["accentInk"],c["accent"]), "accent/accentSoft": cr(c["accent"],c["accentSoft"]),
          "heroAccent/hero": cr(c["heroAccent"],c["hero"]), "hero/heroAccent(btn text)": cr(c["hero"],c["heroAccent"]),
          "white/hero": cr("#F4F6FC",c["hero"]),
        }
        bad={k:round(v,2) for k,v in checks.items() if v<4.5}
        if bad: ok=False; print(name,mode,"FAIL",bad)
        else: print(name,mode,"ok", round(checks["accent/surface"],2), round(checks["muted/surface"],2))

def trip(h): return " ".join(map(str,hx(h)))
def mix(a,b,t):
    A,B=hx(a),hx(b); return "#"+"".join(f"{round(A[i]*(1-t)+B[i]*t):02X}" for i in range(3))
for name,t in T.items():
    for mode,c in t.items():
        c["heroMuted"]=mix("#F4F6FC",c["heroAccent"],0.45)
        r=cr(c["heroMuted"],c["hero"])
        if r<4.5: print("heroMuted FAIL",name,mode,r); ok=False
def block(c):
    m={"bg":"bg","surface":"surface","raised":"raised","line":"line","ink":"ink","muted":"muted","accent":"accent","accentInk":"accent-ink","accentSoft":"accent-soft","hero":"hero","heroAccent":"hero-accent","heroMuted":"hero-muted"}
    return "".join(f"  --{v}: {trip(c[k])};\n" for k,v in m.items())
css=["/* Generated by the theme script: colour pairs (background family + accent), light and dark. */"]
for name,t in T.items():
    sel = f':root[data-theme="{name}"]' + (', :root:not([data-theme])' if name=="classic" else '')
    css.append(f"{sel} {{\n{block(t['light'])}}}")
css.append("@media (prefers-color-scheme: dark) {")
for name,t in T.items():
    sel = f':root[data-theme="{name}"]' + (', :root:not([data-theme])' if name=="classic" else '')
    css.append(f"{sel} {{\n{block(t['dark'])}}}")
css.append("}")
open(sys.argv[1],"w").write("\n".join(css)+"\n")
meta={n:{"light":t["light"]["bg"],"dark":t["dark"]["bg"],"accentLight":t["light"]["accent"],"accentDark":t["dark"]["accent"],"surfaceLight":t["light"]["surface"],"surfaceDark":t["dark"]["surface"]} for n,t in T.items()}
open(sys.argv[2],"w").write("// Generated by the theme script: swatch colours for the theme picker and the browser bar.\nexport const THEMES = " + json.dumps(meta, indent=2) + ";\n")
print("ALL OK" if ok else "SOME FAIL")
