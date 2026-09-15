/*
 * Material Symbols icon.
 *
 * The name goes in the data-icon ATTRIBUTE and is drawn through
 * content:attr() in CSS, never as a child node — pseudo-element content is
 * not DOM text, so it cannot be picked up as anchor text or read out by a
 * screen reader. See globals.css for the full reasoning.
 */
export default function Icon({ name, className }: { name: string; className?: string }) {
	return (
		<span
			className={className ? `msr ${className}` : "msr"}
			data-icon={name}
			aria-hidden="true"
		/>
	);
}
