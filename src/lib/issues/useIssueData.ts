"use client";
import { useCallback, useEffect, useState } from "react";
import type { SchoolsFile } from "../schools/types";
import { assertIssueData } from "./validate";
import type { EducationIssuesFile } from "./types";
import { ACTIVE_PROFILE } from "../profiles";

type State =
  | { status: "idle" | "loading" }
  | { status: "ready"; data: EducationIssuesFile }
  | { status: "error"; message: string };
export function useIssueData(enabled: boolean, schools: SchoolsFile) {
  const [requested, setRequested] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: "idle" });
  if (enabled && ACTIVE_PROFILE.capabilities.educationIssues && !requested) setRequested(true);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    fetch(`${ACTIVE_PROFILE.files.publicDataUrl}/education-issues.json`, {
      signal: controller.signal,
      cache: "no-cache",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("교육문제 자료를 불러오지 못했습니다.");
        const data: unknown = await response.json();
        assertIssueData(data, schools);
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "교육문제 자료를 불러오지 못했습니다.",
          });
      });
    return () => controller.abort();
  }, [requested, attempt, schools]);
  return { state, retry };
}
