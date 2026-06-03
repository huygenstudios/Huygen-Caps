import type { Metadata } from "next";
import "./globals.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "@fontsource/poppins/900.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/900.css";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/montserrat/900.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/700.css";
import "@fontsource/oswald/700.css";
import "@fontsource/anton/400.css";
import "@fontsource/bebas-neue/400.css";

export const metadata: Metadata = {
  title: "Huygen Caps",
  description: "AI caption editor for creators",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/brand/huygen-icon-512.png",
  },
  manifest: "/manifest.json",
};

const criticalShellCss = `
:root{--bg-app:#050505;--bg-panel:#0b0b0b;--bg-panel-dark:#050505;--bg-panel-raised:#111;--text-primary:#f5f1e8;--text-muted:#a8a0aa;--border:#3a3a3a;--border-strong:#e8e3d7;--accent:#a970ff;--accent-hover:#c7a4ff;--button-primary-text:#050505;--shadow-hard:4px 4px 0 #000;--shadow-hard-small:2px 2px 0 #000}
html,body{margin:0;height:100%;overflow:hidden;background:#050505;color:#f5f1e8}
body{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}
button,input,select,textarea{font:inherit}
img{max-width:100%;height:auto}
.flex{display:flex}.inline-flex{display:inline-flex}.inline-grid{display:inline-grid}.grid{display:grid}.hidden{display:none}
.h-screen{height:100vh}.w-screen{width:100vw}.h-full{height:100%}.w-full{width:100%}.h-12{height:3rem}.h-8{height:2rem}.min-h-0{min-height:0}.min-w-0{min-width:0}.min-h-\\[420px\\]{min-height:420px}
.flex-col{flex-direction:column}.flex-1{flex:1 1 0%}.shrink-0{flex-shrink:0}.items-center{align-items:center}.justify-center{justify-content:center}.justify-between{justify-content:space-between}.place-items-center{place-items:center}
.overflow-hidden{overflow:hidden}.overflow-auto{overflow:auto}.overflow-y-auto{overflow-y:auto}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.z-20{z-index:20}
.gap-1{gap:.25rem}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.gap-4{gap:1rem}.space-y-3>:not([hidden])~:not([hidden]){margin-top:.75rem}.space-y-4>:not([hidden])~:not([hidden]){margin-top:1rem}
.p-1{padding:.25rem}.p-2{padding:.5rem}.p-3{padding:.75rem}.p-4{padding:1rem}.px-2{padding-left:.5rem;padding-right:.5rem}.px-3{padding-left:.75rem;padding-right:.75rem}.px-4{padding-left:1rem;padding-right:1rem}.py-1{padding-top:.25rem;padding-bottom:.25rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.py-3{padding-top:.75rem;padding-bottom:.75rem}.mr-2{margin-right:.5rem}.ml-2{margin-left:.5rem}.mx-auto{margin-left:auto;margin-right:auto}
.w-\\[86px\\]{width:86px}.max-w-sm{max-width:24rem}.max-w-full{max-width:100%}.max-h-full{max-height:100%}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.text-center{text-align:center}.text-xs{font-size:.75rem;line-height:1rem}.text-sm{font-size:.875rem;line-height:1.25rem}.text-\\[10px\\]{font-size:10px}.text-\\[11px\\]{font-size:11px}.font-bold{font-weight:700}.font-black{font-weight:900}.uppercase{text-transform:uppercase}.rounded{border-radius:.25rem}.border{border-width:1px}.border-b{border-bottom:1px solid var(--border)}.border-r{border-right:1px solid var(--border)}
.brand-logo{display:block;width:30px!important;height:30px!important;max-width:30px!important;max-height:30px!important;object-fit:contain;box-sizing:border-box}
.empty-logo{display:block;width:96px!important;max-width:96px!important;height:auto!important;object-fit:contain}
.toolbar-shell{min-height:48px;background:#050505;color:#f5f1e8;border-bottom:1px solid #e8e3d7}
.panel{background:#0b0b0b;color:#f5f1e8;border:1px solid #e8e3d7;overflow:hidden}
.panel-header{display:flex;align-items:center;min-height:28px;padding:5px 8px;background:#050505;color:#a8a0aa;border-bottom:1px solid #e8e3d7;font-size:11px;font-weight:900;text-transform:uppercase}
.brand-mark{display:flex;align-items:center;gap:8px;color:#f5f1e8}.brand-name{font-size:14px;font-weight:900;white-space:nowrap}
.btn-primary{background:#a970ff;color:#050505;border:2px solid #e8e3d7;padding:7px 14px;border-radius:2px;font-size:12px;font-weight:900;cursor:pointer;box-shadow:2px 2px 0 #000}
.btn-ghost{background:#050505;color:#a8a0aa;border:1px solid #e8e3d7;padding:5px 10px;border-radius:2px;font-size:11px;font-weight:800;cursor:pointer}
.icon-button{display:inline-grid;place-items:center;min-width:28px;height:28px;padding:0 6px;color:#a8a0aa;background:transparent;border:2px solid transparent;border-radius:2px;cursor:pointer}
.btn-primary:disabled,.btn-ghost:disabled,.icon-button:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.control-input{width:100%;min-height:34px;border:2px solid #3a3a3a;border-radius:2px;background:#050505;color:#f5f1e8;padding:6px 8px;font-size:12px;outline:none}
.brutal-box{background:#050505;border:1px solid #e8e3d7;border-radius:4px}.brutal-empty{background:#050505;border:1px dashed #e8e3d7;border-radius:4px}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: criticalShellCss }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
