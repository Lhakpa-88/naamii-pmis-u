"use client";
import { startTransition, useActionState, type FormEvent } from "react";
import { importWorkbookAction, type ImportState } from "@/lib/entry/actions";

const initial: ImportState = { outcome: null, error: null };

/** Upload a filled-in template: "Check file" validates only, "Import" validates and saves. */
export function ImportForm() {
  const [state, action, pending] = useActionState(importWorkbookAction, initial);
  const o = state.outcome;
  // Submit by hand so the chosen file stays selected after "Check file" (a form action would reset it).
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(data));
  };
  return (
    <div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-[13px] font-medium text-ink" htmlFor="entry-file">Filled-in workbook (.xlsx)</label>
        <input id="entry-file" name="file" type="file" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="block w-full rounded-md border border-cool-300 bg-white text-[13px] text-ink file:mr-3 file:border-0 file:border-r file:border-cool-300 file:bg-cool-100 file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-ink" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" name="mode" value="check" disabled={pending} className="rounded-md border border-cool-300 bg-white px-3.5 py-2 text-[13px] font-medium text-ink hover:bg-cool-100 disabled:opacity-60">Check file</button>
          <button type="submit" name="mode" value="import" disabled={pending} className="rounded-md bg-ink px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-ink-700 disabled:opacity-60">Import</button>
          {pending ? <span role="status" className="text-[12.5px] text-grey">Reading the workbook…</span> : null}
        </div>
        <p className="text-[12px] text-grey">“Check file” reports problems without saving anything. “Import” saves only if every row is valid.</p>
      </form>

      {state.error ? <p role="alert" className="mt-4 rounded-md border border-critical/30 bg-critical/5 px-3 py-2 text-[13px] text-critical">{state.error}</p> : null}

      {o ? (
        <div className="mt-4" aria-live="polite">
          <div className={`rounded-md border px-3 py-2.5 text-[13px] ${o.ok ? "border-good/30 bg-good/10 text-good" : "border-critical/30 bg-critical/5 text-critical"}`}>
            <p className="font-semibold">
              {o.ok
                ? o.checkOnly ? "The file is valid. Nothing has been saved yet — press Import to save it." : "Imported. All rows were saved."
                : `${o.issuesTotal} problem${o.issuesTotal === 1 ? "" : "s"} found — nothing was saved. Correct the workbook and upload it again.`}
            </p>
            <p className="mt-0.5 text-ink">{o.fileName}</p>
          </div>

          {o.sheets.length ? (
            <table className="mt-3 w-full text-[13px]">
              <thead className="bg-cool-100 text-[11.5px] uppercase tracking-wide text-grey">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Sheet</th>
                  <th className="px-3 py-2 text-right font-semibold">Rows</th>
                  <th className="px-3 py-2 text-right font-semibold">{o.ok && !o.checkOnly ? "Added" : "To add"}</th>
                  <th className="px-3 py-2 text-right font-semibold">{o.ok && !o.checkOnly ? "Updated" : "To update"}</th>
                  <th className="px-3 py-2 text-right font-semibold">Problems</th>
                </tr>
              </thead>
              <tbody>
                {o.sheets.map((s) => (
                  <tr key={s.sheet} className="border-t border-cool-200">
                    <td className="px-3 py-2 font-medium text-ink">{s.sheet}</td>
                    <td className="tnum px-3 py-2 text-right">{s.rows}</td>
                    <td className="tnum px-3 py-2 text-right">{s.inserted}</td>
                    <td className="tnum px-3 py-2 text-right">{s.updated}</td>
                    <td className={`tnum px-3 py-2 text-right ${s.errors ? "font-semibold text-critical" : ""}`}>{s.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {o.warnings.length ? (
            <ul className="mt-3 flex flex-col gap-1 text-[12.5px] text-[#7a4f00]">
              {o.warnings.map((w) => <li key={w} className="rounded border border-warning/40 bg-[#fff6e5] px-3 py-1.5">{w}</li>)}
            </ul>
          ) : null}

          {o.issues.length ? (
            <div className="mt-3 max-h-[420px] overflow-auto rounded-md border border-cool-200">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-cool-100 text-[11.5px] uppercase tracking-wide text-grey">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Sheet</th>
                    <th className="px-3 py-2 text-right font-semibold">Row</th>
                    <th className="px-3 py-2 text-left font-semibold">Column</th>
                    <th className="px-3 py-2 text-left font-semibold">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {o.issues.map((i, n) => (
                    <tr key={n} className="border-t border-cool-200 align-top">
                      <td className="whitespace-nowrap px-3 py-1.5 text-ink">{i.sheet ?? "—"}</td>
                      <td className="tnum px-3 py-1.5 text-right">{i.row ?? "—"}</td>
                      <td className="px-3 py-1.5 text-grey">{i.field ?? "—"}</td>
                      <td className="px-3 py-1.5 text-ink">{i.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {o.issuesTotal > o.issues.length ? <p className="border-t border-cool-200 px-3 py-2 text-[12px] text-grey">Showing the first {o.issues.length} of {o.issuesTotal} problems.</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
