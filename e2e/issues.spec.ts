import { expect, test } from "./fixtures";

const question = "학생이 줄어드는 지역의 학교는 어떤 상황인가?";
const special = "특수학급과 특수학교는 어디에 분포하는가?";
const ready = async (page: import("@playwright/test").Page) => {
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({
    timeout: 20000,
  });
};

test("교육문제에서 지정 현황·관련 학교·URL을 함께 탐색하고 복원한다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await ready(page);
  await expect(page.getByRole("tab", { name: "학교 탐색" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page
    .getByRole("searchbox", { name: "학교명 검색" })
    .fill("전주초등학교");
  await page.getByRole("tab", { name: "교육문제", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp(question.replace("?", "")) })
    .click();
  await expect(
    page.getByRole("heading", { name: question, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("인구감소지역 10곳 · 관심지역 1곳", { exact: true }).first(),
  ).toBeVisible();
  const compare = page.getByRole("region", { name: "교육문제 시군 비교" });
  await compare.getByRole("button", { name: /진안군/ }).click();
  await expect(page).toHaveURL(/region=52720/);
  await expect(
    page
      .getByRole("region", { name: "교육문제 지역 상세" })
      .getByRole("heading", { name: "진안군 함께 살펴보기" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "소규모학교 비율", exact: true })
    .click();
  await expect(page).toHaveURL(/issueMetric=small-share/);
  const count = await page.getByTestId("issue-school-count").innerText();
  expect(count).not.toContain("목록 0개");
  await page.reload();
  await ready(page);
  await expect(
    page.getByRole("button", { name: "소규모학교 비율", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("issue-school-count")).toHaveText(count);
  const related = page.getByRole("region", { name: "교육문제 관련 학교" });
  await related.locator('button[data-testid^="issue-school-"]').first().click();
  await expect(page.getByRole("region", { name: "선택한 학교" })).toBeVisible();
  await expect(page).toHaveURL(/issue=regional-sustainability/);
  await page.getByRole("button", { name: "이 지역 학교 검색 →" }).click();
  await expect(
    page.getByRole("searchbox", { name: "학교명 검색" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "시군", exact: true }),
  ).toHaveValue("52720");
  await expect(page).not.toHaveURL(/issue=/);
  expect(errors).toEqual([]);
});

test("특수학교는 좌표 없이도 집계와 목록에 포함하고 일반학교 특수학급과 분리한다", async ({
  page,
}) => {
  await page.goto(
    "/?view=issues&issue=special-education&issueMetric=special-classes",
  );
  await ready(page);
  await expect(
    page.getByRole("heading", { name: special, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("전북 전체 559학급", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "특수학교 수", exact: true }).click();
  await expect(page.getByTestId("issue-school-count")).toHaveText(
    "목록 11개 · 지도 표시 가능 0개",
  );
  await page.locator('button[data-testid^="issue-school-"]').first().click();
  await expect(page.getByRole("region", { name: "선택한 학교" })).toBeVisible();
  const dots = await page.evaluate(() => {
    const layer = window
      .__jbmap!.deck.props.layers?.flat()
      .find(
        (l) => l && typeof l === "object" && "id" in l && l.id === "schools",
      );
    return layer && "props" in layer
      ? (layer.props.data as unknown[]).length
      : -1;
  });
  expect(dots).toBe(0);
});

test("교육문제 자료 실패는 기존 검색에 영향을 주지 않고 재시도할 수 있다", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/data/education-issues.json", async (route) => {
    if (fail) await route.fulfill({ status: 503, body: "unavailable" });
    else await route.continue();
  });
  await page.goto("/?view=issues");
  await expect(
    page.getByRole("alert").filter({ hasText: "교육문제 자료" }),
  ).toContainText("교육문제 자료를 불러오지 못했습니다");
  await page.getByRole("tab", { name: "학교 탐색" }).click();
  await expect(
    page.getByRole("searchbox", { name: "학교명 검색" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "교육문제", exact: true }).click();
  fail = false;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(question.replace("?", "")) }),
  ).toBeVisible();
});

test("모바일에서 질문·학교 선택 후 정보 패널을 다시 열어도 교육문제가 유지된다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "/?view=issues&issue=regional-sustainability&issueMetric=small-share&region=52720",
  );
  await ready(page);
  await page.getByRole("button", { name: "학교·통계", exact: true }).click();
  await page.locator('button[data-testid^="issue-school-"]').first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /학교 정보 보기/ }).click();
  await expect(page.getByRole("region", { name: "선택한 학교" })).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "교육문제", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("알 수 없는 질문은 목록, 다른 주제 지표는 기본 지표로 돌아간다", async ({
  page,
}) => {
  await page.goto("/?view=issues&issue=reading");
  await expect(
    page.getByRole("heading", { name: "우리 지역 교육, 어디부터 살펴볼까요?" }),
  ).toBeVisible();
  await page.goto(
    "/?view=issues&issue=special-education&issueMetric=designation",
  );
  await expect(
    page.getByRole("button", { name: "일반학교 특수학급 수", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
