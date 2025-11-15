/** biome-ignore-all lint/style/noNonNullAssertion: auwehiuhdfkljhdsfv */
import parser from "@typescript-eslint/parser";
import { AST_NODE_TYPES } from "@typescript-eslint/typescript-estree";
import fsp from "node:fs/promises";
import path, { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Identifier,
  Literal,
  TSInterfaceDeclaration,
  TSLiteralType,
  TSPropertySignature,
  TSTypeAnnotation,
} from "../../node_modules/@typescript-eslint/types/dist/generated/ast-spec.js";

type TableColumn = {
  name: string;
  type: "integer" | "text" | "boolean" | "binary" | "bigint";
};

type Table = {
  name: string;
  columns: TableColumn[];
};

function formatObject(obj: Table[]) {
  let str = "export const Schema = [\n";
  for (const element of obj) {
    str += `  {\n    name: "${element.name}",\n    columns: [\n`;
    for (const column of element.columns) {
      str += `      { name: "${column.name}", type: "${column.type}" },\n`;
    }
    str += "    ],\n  },\n";
  }
  str += "];\n";
  return str;
}

export default async function parseSchema() {
  const pathToDBSchema = path.join(path.dirname(fileURLToPath(import.meta.url)), "../typings/database.d.ts");
  const parsedCode = parser.parse((await fsp.readFile(pathToDBSchema)).toString("utf8"), {
    ecmaVersion: "latest",
  });

  const declarations = parsedCode.body;

  const interfaces = declarations.filter(dec => dec.type === AST_NODE_TYPES.TSInterfaceDeclaration && dec.extends);

  // Be prepared for lots of type casting.
  const tables: Table[] = (interfaces as TSInterfaceDeclaration[])
    .filter(
      dec =>
        dec.type === AST_NODE_TYPES.TSInterfaceDeclaration &&
        dec.extends &&
        (dec.extends[0]?.expression as Identifier | null)?.name === "Table" &&
        (dec.body.body as TSPropertySignature[]).find(prop => (prop.key as Identifier).name === "_tableName"),
    )
    .map(_interface => {
      const tableName: string = (
        (
          (
            (_interface.body.body as TSPropertySignature[]).find(prop => (prop.key as Identifier).name === "_tableName")
              ?.typeAnnotation as unknown as TSTypeAnnotation
          ).typeAnnotation as TSLiteralType
        ).literal as Literal
      ).value as string;

      const columns = _interface.body.body
        .filter((body): body is TSPropertySignature => body.type === AST_NODE_TYPES.TSPropertySignature)
        .filter(body => !(body.key as Identifier).name.startsWith("_"))
        .map((body: TSPropertySignature) => {
          const columnResult = {} as TableColumn;
          columnResult.name = (body.key as Identifier).name;

          const typeAnnotation = (body.typeAnnotation as TSTypeAnnotation).typeAnnotation;
          const interpretedType = typeAnnotation.type;

          const textTypes = [AST_NODE_TYPES.TSTypeLiteral, AST_NODE_TYPES.TSStringKeyword, AST_NODE_TYPES.TSArrayType];
          if (textTypes.includes(interpretedType)) columnResult.type = "text";
          else if (interpretedType === AST_NODE_TYPES.TSNumberKeyword) columnResult.type = "integer";
          else if (interpretedType === AST_NODE_TYPES.TSBooleanKeyword) columnResult.type = "boolean";
          else if (interpretedType === AST_NODE_TYPES.TSTypeReference && (typeAnnotation.typeName as Identifier).name === "Buffer")
            columnResult.type = "binary";
          else if (interpretedType === AST_NODE_TYPES.TSTypeReference && (typeAnnotation.typeName as Identifier).name === "bigint")
            columnResult.type = "bigint";
          else if (
            // TODO: Check if the imported type has only integers, or has strings as well.
            interpretedType === AST_NODE_TYPES.TSImportType &&
            (typeAnnotation.qualifier as Identifier).name === "ChannelType"
          )
            columnResult.type = "integer";
          else columnResult.type = "text";
          return columnResult;
        });
      return {
        name: tableName,
        columns,
      };
    });
  const filepath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../ParsedDatabaseSchema.ts");
  await fsp.writeFile(filepath, formatObject(tables));

  console.info(`Wrote ${tables.length.toString()} tables to ${filepath}`);
}

const pathToThisFile = resolve(fileURLToPath(import.meta.url));
const pathPassedToNode = resolve(process.argv[1] ?? "");
const isThisFileBeingRunViaCLI = pathToThisFile.includes(pathPassedToNode);

if (isThisFileBeingRunViaCLI) {
  parseSchema().catch((error: unknown) => {
    console.error(error);
  });
}
