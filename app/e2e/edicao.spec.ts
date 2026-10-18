import { expect, test, type Page } from "@playwright/test";
import { clienteServico, limpar, NOMES, semear, type Semente } from "./semente";

test.describe.configure({ mode: "serial" });

const sb = clienteServico();
let s: Semente;

test.beforeAll(async () => {
  s = await semear(sb);
});

test.afterAll(async () => {
  if (s) await limpar(sb, s);
});

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(s.email);
  await page.getByLabel("Senha").fill(s.senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/painel");
}

const celula = (page: Page, slotId: string) =>
  page.locator(`#celula-${slotId}`);

test("edição manual: troca, veredito, salvar, duplicar e oficial", async ({
  page,
}) => {
  await entrar(page);
  await page.goto(`/grade/${s.cenarioId}`);
  await page.getByRole("link", { name: "Editar grade" }).click();
  await page.waitForURL(/editar=1/);
  // cliques antes da hidratação se perderiam
  await page.waitForLoadState("networkidle");
  const veredito = page.locator("aside");
  await expect(veredito).toContainText("Nenhuma troca ainda.");

  // Português no 1º horário de segunda: a professora está indisponível
  await celula(page, s.slots.seg1).click();
  await expect(celula(page, s.slots.seg1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await celula(page, s.slots.seg2).click();
  await expect(celula(page, s.slots.seg1)).toContainText(NOMES.portugues);
  await expect(veredito).toContainText(
    `Disponibilidade de ${NOMES.professoraPortugues}`,
  );

  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(celula(page, s.slots.seg1)).toContainText(NOMES.matematica);
  await expect(veredito).toContainText("Nenhuma troca ainda.");

  // Troca válida: História vai para segunda, Matemática para terça
  await celula(page, s.slots.seg1).click();
  await celula(page, s.slots.ter1).click();
  await expect(veredito).toContainText("Nenhuma regra obrigatória violada.");

  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.waitForURL(/visao=turma/);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/versão 2/)).toBeVisible();
  await expect(page.locator("table tbody tr").first()).toContainText(
    NOMES.historia,
  );

  // Duplicar abre a cópia; marcá-la como oficial mostra o selo
  await page.getByRole("button", { name: "Duplicar", exact: true }).click();
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith("/grade/") && !url.pathname.endsWith(s.cenarioId),
  );
  await expect(page.getByText(/cópia de/)).toBeVisible();
  await page.waitForLoadState("networkidle");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Marcar como oficial" }).click();
  await expect(page.getByText("Oficial", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Marcar como oficial" }),
  ).toHaveCount(0);
});
