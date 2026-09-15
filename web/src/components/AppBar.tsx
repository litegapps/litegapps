import Link from "next/link";
import Icon from "./Icon";
import NavDrawer from "./NavDrawer";

/* Top bar shared by every signed-in page. Navigation lives in the drawer. */
export default function AppBar({ user }: { user: string }) {
	return (
		<header className="bar">
			<div className="bar-in">
				<Link href="/" className="brand">
					<Icon name="apps" />
					<span>LiteGapps</span>
				</Link>
				<div className="spacer" />
				<NavDrawer user={user} />
			</div>
		</header>
	);
}
