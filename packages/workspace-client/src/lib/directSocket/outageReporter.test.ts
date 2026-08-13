import { afterEach, describe, expect, it } from "bun:test";
import {
	createOutageReporter,
	type DirectSocketTelemetryEvent,
	setDirectSocketTelemetry,
} from "./outageReporter";

let telemetry: DirectSocketTelemetryEvent[] = [];

function collect(): void {
	telemetry = [];
	setDirectSocketTelemetry((event) => telemetry.push(event));
}

afterEach(() => {
	setDirectSocketTelemetry(null);
	telemetry = [];
});

describe("createOutageReporter", () => {
	it("reports degraded once at the attempt threshold, then recovered", () => {
		collect();
		const reporter = createOutageReporter("bus");
		reporter.attempt("ws://host.local/events?token=secret");
		for (let attempt = 1; attempt <= 8; attempt++) {
			reporter.failed(attempt, { code: 1006, reason: "" });
		}
		expect(telemetry.map((event) => event.kind)).toEqual(["degraded"]);
		expect(telemetry[0]).toMatchObject({
			socketName: "bus",
			endpoint: "ws://host.local/events",
			closeCode: 1006,
			failedAttempts: 5,
		});

		reporter.opened(9);
		expect(telemetry.map((event) => event.kind)).toEqual([
			"degraded",
			"recovered",
		]);
		expect(telemetry[1]?.outageMs).not.toBeNull();
	});

	it("keeps the latest close info and clears it after recovery", () => {
		collect();
		const reporter = createOutageReporter("bus");
		reporter.attempt("ws://host.local/events");
		reporter.failed(4, { code: 1006, reason: "abnormal" });
		reporter.failed(5);
		expect(telemetry[0]).toMatchObject({
			kind: "degraded",
			closeCode: 1006,
			closeReason: "abnormal",
		});

		reporter.opened(6);
		for (let attempt = 1; attempt <= 6; attempt++) reporter.failed(attempt);
		const second = telemetry.filter((event) => event.kind === "degraded")[1];
		expect(second?.closeCode).toBeNull();
	});

	it("never lets a throwing sink escape into the caller", () => {
		setDirectSocketTelemetry(() => {
			throw new Error("analytics exploded");
		});
		const reporter = createOutageReporter("bus");
		reporter.attempt("ws://host.local/events");
		expect(() => reporter.failed(6)).not.toThrow();
		expect(() => reporter.opened(7)).not.toThrow();
	});

	it("stays silent for short blips and clean opens", () => {
		collect();
		const reporter = createOutageReporter("bus");
		reporter.attempt("ws://host.local/events");
		reporter.failed(1);
		reporter.failed(2);
		reporter.opened(3);
		expect(telemetry).toEqual([]);
	});
});
