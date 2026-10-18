/**
 * Leitura do pacote de carga em CSV (docs/carga/README.md, seção 2.2): um
 * arquivo por entidade, separador ";", UTF-8, cabeçalho obrigatório.
 */

/** Lê CSV (RFC 4180, separador ";") em objetos indexados pelo cabeçalho. */
export function lerCsv(texto: string): Record<string, string>[] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  const s = texto.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '"' && s[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        aspas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      aspas = true;
    } else if (c === ";") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  const uteis = linhas.filter((l) => l.some((v) => v.trim() !== ""));
  if (uteis.length === 0) return [];
  const cabecalho = uteis[0].map((h) => h.trim());
  return uteis.slice(1).map((l) =>
    Object.fromEntries(cabecalho.map((h, i) => [h, l[i] ?? ""])),
  );
}

type TipoColuna = "numero" | "booleano" | "lista" | "json";

const ARQUIVOS: Record<string, { obrigatorio: boolean; tipos: Record<string, TipoColuna> }> = {
  origem: { obrigatorio: true, tipos: { ano_letivo: "numero" } },
  turnos: { obrigatorio: true, tipos: {} },
  horarios: { obrigatorio: true, tipos: { dia: "numero", ordem: "numero" } },
  turmas: { obrigatorio: true, tipos: {} },
  disciplinas: { obrigatorio: true, tipos: {} },
  professores: { obrigatorio: true, tipos: {} },
  recursos: { obrigatorio: false, tipos: { capacidade: "numero" } },
  disponibilidades: { obrigatorio: false, tipos: { dia: "numero", ordem: "numero" } },
  atribuicoes: {
    obrigatorio: true,
    tipos: { carga_semanal: "numero", geminadas: "numero", recursos: "lista" },
  },
  regras: {
    obrigatorio: false,
    tipos: { peso: "numero", hard: "booleano", ativa: "booleano", parametros: "json" },
  },
};

/**
 * Monta o pacote bruto (a validar com `validarPacote`) a partir dos textos
 * dos arquivos CSV, indexados pelo nome do arquivo. Célula vazia = campo
 * ausente; valores que não convertem seguem como texto para a validação
 * acusar.
 */
export function pacoteDeCsv(arquivos: Record<string, string>): {
  bruto: Record<string, unknown>;
  erros: string[];
} {
  const erros: string[] = [];
  const bruto: Record<string, unknown> = {};
  const porEntidade = new Map<string, string>();
  for (const [nome, texto] of Object.entries(arquivos)) {
    const base = nome.split(/[\\/]/).pop()!.toLowerCase();
    const entidade = base.replace(/\.csv$/, "");
    if (!base.endsWith(".csv") || !(entidade in ARQUIVOS)) {
      erros.push(`Arquivo "${nome}" não faz parte do pacote.`);
      continue;
    }
    porEntidade.set(entidade, texto);
  }

  for (const [entidade, { obrigatorio, tipos }] of Object.entries(ARQUIVOS)) {
    const texto = porEntidade.get(entidade);
    if (texto === undefined) {
      if (obrigatorio) erros.push(`Falta o arquivo "${entidade}.csv".`);
      continue;
    }
    const linhas = lerCsv(texto).map((linha, i) => {
      const obj: Record<string, unknown> = {};
      for (const [coluna, valor] of Object.entries(linha)) {
        if (valor === "") continue;
        const tipo = tipos[coluna];
        if (tipo === "numero") {
          obj[coluna] = /^-?\d+$/.test(valor) ? Number(valor) : valor;
        } else if (tipo === "booleano") {
          obj[coluna] = valor === "true" ? true : valor === "false" ? false : valor;
        } else if (tipo === "lista") {
          obj[coluna] = valor.split("|").filter((v) => v !== "");
        } else if (tipo === "json") {
          try {
            obj[coluna] = JSON.parse(valor);
          } catch {
            erros.push(`${entidade}.csv, linha ${i + 2}: ${coluna} não é um JSON válido.`);
          }
        } else {
          obj[coluna] = valor;
        }
      }
      return obj;
    });
    if (entidade === "origem") {
      const { versao, ...origem } = linhas[0] ?? {};
      bruto.versao = versao;
      bruto.origem = origem;
    } else {
      bruto[entidade] = linhas;
    }
  }
  return { bruto, erros };
}
