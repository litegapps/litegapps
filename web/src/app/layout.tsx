import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	variable: "--font-jakarta",
	display: "swap",
});

// display=block: until the icon font arrives the browser draws NOTHING rather
// than the ligature text. Not enough on its own (the block period is ~3s and
// the file is several MB), hence the boot script below.
const ICON_CSS =
	"https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block";

/*
 * Boot script: theme (anti-FOUC) + icon hiding until the icon font is loaded.
 *
 * Material Symbols are ligatures, so before the font arrives `arrow_back`
 * renders as the literal word. This deliberately walks document.fonts rather
 * than using fonts.ready/check(): both answer "ready" exactly when the
 * @font-face is not there at all, which is the moment being covered up.
 *
 * The 10s cap is a safety net: a font that fails to load is better off ending
 * as words than as a UI with no icons at all.
 */
const BOOT = `
(function(){var r=document.documentElement;
try{var t=localStorage.getItem('lg-theme');if(t)r.setAttribute('data-theme',t);}catch(e){}
var done=false;function show(){if(done)return;done=true;r.classList.remove('icons-pending');}
function poll(){try{var fs=document.fonts;if(!fs||!fs.forEach)return show();
var seen=false,ok=false;fs.forEach(function(f){if(String(f.family).replace(/["']/g,'').indexOf('Material Symbols')===0){seen=true;if(f.status==='loaded')ok=true;}});
if(ok)return show();if(seen&&fs.load){try{fs.load('24px "Material Symbols Rounded"');}catch(e){}}}catch(e){return show();}
setTimeout(poll,120);}
poll();setTimeout(show,10000);})();
`;

export const metadata: Metadata = {
	title: "LiteGapps — Build Panel",
	description: "Build and release panel for the LiteGapps project.",
	// The whole site is the admin panel, so keep it out of every index.
	robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="id" data-theme="auto" className={`${jakarta.variable} icons-pending`}>
			<head>
				{/* eslint-disable-next-line @next/next/no-page-custom-font */}
				<link rel="stylesheet" href={ICON_CSS} />
				<script dangerouslySetInnerHTML={{ __html: BOOT }} />
			</head>
			<body>{children}</body>
		</html>
	);
}
