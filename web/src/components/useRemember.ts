"use client";

import { useEffect, useRef } from "react";

/*
 * Store a form's state in the panel database whenever it changes.
 *
 * Debounced, because ticking five boxes should be one write, and skipped on
 * the first render: that value came from the database a moment ago.
 */
export function useRemember(form: "batch" | "single" | "auto", value: Record<string, unknown>) {
	const json = JSON.stringify(value);
	const first = useRef(true);

	useEffect(() => {
		if (first.current) {
			first.current = false;
			return;
		}
		const t = setTimeout(() => {
			fetch("/api/prefs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ form, ...JSON.parse(json) }),
			}).catch(() => {
				// A preference that cannot be stored is not worth an error here.
			});
		}, 500);
		return () => clearTimeout(t);
	}, [form, json]);
}
