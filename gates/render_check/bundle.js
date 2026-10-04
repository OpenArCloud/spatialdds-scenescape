var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/@foxglove/omgidl-parser/dist/index.js
var require_dist = __commonJS({
  "node_modules/@foxglove/omgidl-parser/dist/index.js"(exports, module) {
    (() => {
      var __webpack_modules__ = {
        /***/
        128: (
          /***/
          ((__unused_webpack_module, exports2, __webpack_require__2) => {
            "use strict";
            Object.defineProperty(exports2, "__esModule", { value: true });
            exports2.parseIDLToAST = parseIDLToAST;
            const nearley_1 = __webpack_require__2(662);
            const grammar_1 = __webpack_require__2(836);
            function parseIDLToAST(definition) {
              const parser = new nearley_1.Parser(grammar_1.IDL_GRAMMAR);
              parser.feed(definition);
              parser.finish();
              const results = parser.results;
              if (results.length === 0) {
                throw new Error(`Could not parse message definition (unexpected end of input): '${definition}'`);
              }
              if (results.length > 1) {
                throw new Error(`Ambiguous grammar: '${definition}'`);
              }
              return results[0];
            }
          })
        ),
        /***/
        165: (
          /***/
          ((__unused_webpack_module, exports2) => {
            "use strict";
            Object.defineProperty(exports2, "__esModule", { value: true });
            exports2.IDLNode = void 0;
            exports2.toScopedIdentifier = toScopedIdentifier;
            class IDLNode {
              /** Map of all IDLNodes in a schema definition */
              map;
              /** Unresolved node parsed directly from schema */
              astNode;
              /** Array of strings that represent namespace scope that astNode is contained within. */
              scopePath;
              constructor(scopePath, astNode, idlMap) {
                this.scopePath = scopePath;
                this.astNode = astNode;
                this.map = idlMap;
              }
              get declarator() {
                return this.astNode.declarator;
              }
              get name() {
                return this.astNode.name;
              }
              get annotations() {
                return this.astNode.annotations;
              }
              /** Returns scoped identifier of the astNode: (...scopePath::name) */
              get scopedIdentifier() {
                return toScopedIdentifier([...this.scopePath, this.name]);
              }
              /** Gets any node in map. Fails if not found.*/
              getNode(scopePath, name) {
                const maybeNode = resolveScopedOrLocalNodeReference({
                  usedIdentifier: name,
                  scopeOfUsage: scopePath,
                  definitionMap: this.map
                });
                if (maybeNode == void 0) {
                  throw new Error(`Could not find node ${name} in ${scopePath.join("::")} referenced by ${this.scopedIdentifier}`);
                }
                return maybeNode;
              }
              /** Gets a constant node under a local-to-this-node or scoped identifier. Fails if not a ConstantNode */
              getConstantNode(identifier, scopePath = this.scopePath) {
                const maybeConstantNode = this.getNode(scopePath, identifier);
                if (maybeConstantNode.declarator !== "const") {
                  throw new Error(`Expected ${this.name} to be a constant in ${this.scopedIdentifier}`);
                }
                return maybeConstantNode;
              }
            }
            exports2.IDLNode = IDLNode;
            function resolveScopedOrLocalNodeReference({ usedIdentifier, scopeOfUsage, definitionMap }) {
              let referencedNode = void 0;
              const currPrefix = [...scopeOfUsage];
              for (; ; ) {
                const identifierToTry = toScopedIdentifier([...currPrefix, usedIdentifier]);
                referencedNode = definitionMap.get(identifierToTry);
                if (referencedNode != void 0) {
                  break;
                }
                if (currPrefix.length === 0) {
                  break;
                }
                currPrefix.pop();
              }
              return referencedNode;
            }
            function toScopedIdentifier(path) {
              return path.join("::");
            }
          })
        ),
        /***/
        177: (
          /***/
          ((__unused_webpack_module, exports2, __webpack_require__2) => {
            "use strict";
            Object.defineProperty(exports2, "__esModule", { value: true });
            exports2.buildMap = buildMap;
            exports2.toIDLMessageDefinitions = toIDLMessageDefinitions;
            const IDLNodes_1 = __webpack_require__2(334);
            const UnionIDLNode_1 = __webpack_require__2(522);
            function buildMap(definitions) {
              const idlMap = /* @__PURE__ */ new Map();
              for (const definition of definitions) {
                traverseIDL([definition], (path) => {
                  const node = path[path.length - 1];
                  const namePath = path.map((n) => n.name);
                  const scopePath = namePath.slice(0, -1);
                  const newNodes = makeIDLNode(scopePath, node, idlMap);
                  idlMap.set(newNodes.scopedIdentifier, newNodes);
                  if (node.declarator === "enum") {
                    let prevEnumValue = -1;
                    const enumConstants = node.enumerators.flatMap((m) => {
                      const enumValue = getValueAnnotation(m.annotations) ?? ++prevEnumValue;
                      if (typeof enumValue !== "number") {
                        throw new Error(
                          // eslint-disable-next-line @typescript-eslint/no-base-to-string
                          `Enum value, ${enumValue?.toString() ?? "undefined"}, assigned to ${node.name}::${m.name} must be a number`
                        );
                      }
                      prevEnumValue = enumValue;
                      return {
                        declarator: "const",
                        isConstant: true,
                        name: m.name,
                        type: "unsigned long",
                        value: enumValue,
                        isComplex: false
                      };
                    });
                    for (const constant of enumConstants) {
                      const idlConstantNode = new IDLNodes_1.ConstantIDLNode(namePath, constant, idlMap);
                      idlMap.set(idlConstantNode.scopedIdentifier, idlConstantNode);
                    }
                    const moduleLevelNamePath = namePath.slice(0, -1);
                    for (const constant of enumConstants) {
                      const idlConstantNode = new IDLNodes_1.ConstantIDLNode(moduleLevelNamePath, constant, idlMap);
                      idlMap.set(idlConstantNode.scopedIdentifier, idlConstantNode);
                    }
                  }
                });
              }
              return idlMap;
            }
            function getValueAnnotation(annotations) {
              if (!annotations) {
                return void 0;
              }
              const valueAnnotation = annotations["value"];
              if (valueAnnotation && valueAnnotation.type === "const-param") {
                return valueAnnotation.value;
              }
              return void 0;
            }
            function toIDLMessageDefinitions(map) {
              const messageDefinitions = [];
              for (const node of map.values()) {
                if (node.declarator === "struct") {
                  messageDefinitions.push(node.toIDLMessageDefinition());
                } else if (node.declarator === "module") {
                  const def = node.toIDLMessageDefinition();
                  if (def != void 0) {
                    messageDefinitions.push(def);
                  }
                } else if (node.declarator === "const") {
                } else if (node.declarator === "enum") {
                  messageDefinitions.push(node.toIDLMessageDefinition());
                } else if (node.declarator === "union") {
                  messageDefinitions.push(node.toIDLMessageDefinition());
                }
              }
              return messageDefinitions;
            }
            const makeIDLNode = (scopePath, node, idlMap) => {
              switch (node.declarator) {
                case "module":
                  return new IDLNodes_1.ModuleIDLNode(scopePath, node, idlMap);
                case "enum":
                  return new IDLNodes_1.EnumIDLNode(scopePath, node, idlMap);
                case "const":
                  return new IDLNodes_1.ConstantIDLNode(scopePath, node, idlMap);
                case "struct":
                  return new IDLNodes_1.StructIDLNode(scopePath, node, idlMap);
                case "struct-member":
                  return new IDLNodes_1.StructMemberIDLNode(scopePath, node, idlMap);
                case "typedef":
                  return new IDLNodes_1.TypedefIDLNode(scopePath, node, idlMap);
                case "union":
                  return new UnionIDLNode_1.UnionIDLNode(scopePath, node, idlMap);
              }
            };
            function traverseIDL(path, processNode) {
              const currNode = path[path.length - 1];
              if ("definitions" in currNode) {
                currNode.definitions.forEach((n) => {
                  traverseIDL([...path, n], processNode);
                });
              }
              processNode(path);
            }
          })
        ),
        /***/
        330: (
          /***/
          ((__unused_webpack_module, exports2, __webpack_require__2) => {
            "use strict";
            Object.defineProperty(exports2, "__esModule", { value: true });
            exports2.TypedefIDLNode = void 0;
            const ReferenceTypeIDLNode_1 = __webpack_require__2(852);
            class TypedefIDLNode extends ReferenceTypeIDLNode_1.ReferenceTypeIDLNode {
            }
            exports2.TypedefIDLNode = TypedefIDLNode;
          })
        ),
        /***/
        334: (
          /***/
          (function(__unused_webpack_module, exports2, __webpack_require__2) {
            "use strict";
            var __createBinding = this && this.__createBinding || (Object.create ? (function(o, m, k, k2) {
              if (k2 === void 0) k2 = k;
              var desc = Object.getOwnPropertyDescriptor(m, k);
              if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                desc = { enumerable: true, get: function() {
                  return m[k];
                } };
              }
              Object.defineProperty(o, k2, desc);
            }) : (function(o, m, k, k2) {
              if (k2 === void 0) k2 = k;
              o[k2] = m[k];
            }));
            var __exportStar = this && this.__exportStar || function(m, exports3) {
              for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
            };
            Object.defineProperty(exports2, "__esModule", { value: true });
            __exportStar(__webpack_require__2(877), exports2);
            __exportStar(__webpack_require__2(774), exports2);
            __exportStar(__webpack_require__2(165), exports2);
            __exportStar(__webpack_require__2(453), exports2);
            __exportStar(__webpack_require__2(393), exports2);
            __exportStar(__webpack_require__2(572), exports2);
            __exportStar(__webpack_require__2(330), exports2);
          })
        ),
        /***/
        393: (
          /***/
          ((__unused_webpack_module, exports2, __webpack_require__2) => {
            "use strict";
            Object.defineProperty(exports2, "__esModule", { value: true });
            exports2.StructIDLNode = void 0;
            const IDLNode_1 = __webpack_require__2(165);
            class StructIDLNode extends IDLNode_1.IDLNode {
              get type() {
                return this.astNode.name;
              }
              get definitions() {
                return this.astNode.definitions.map((def) => this.getStructMemberNode(def.name));
              }
              /** Writes out struct as IDL Message definition with resolved `definitions` members */
              toIDLMessageDefinition() {
                const definitions = this.definitions.map((def) => def.toIDLMessageDefinitionField());
                return {
                  name: this.scopedIdentifier,
                  definitions,
                  aggregatedKind: "struct",
                  ...this.astNode.annotations ? { annotations: this.astNode.annotations } : void 0
                };
              }
              /** Gets node within struct by its local name (unscoped) */
              getStructMemberNode(name) {
                const maybeStructMember = this.getNode([...this.scopePath, this.name], name);
                if (maybeStructMember.declarator !== "struct-member") {
                  throw new Error(`Expected ${name} to be a struct member in ${this.scopedIdentifier}`);
                }
                return maybeStructMember;
              }
            }
            exports2.StructIDLNode = StructIDLNode;
          })
        ),
        /***/
        428: (
          /***/
          ((__unused_webpack_module, exports2) => {
            "use strict";
            Object.defineProperty(exports2, "__esModule", { value: true });
          })
        ),
        /***/
        453: (
          /***/
          ((__unused_webpack_module, exports2, __webpack_require__2) => {
            "use strict";
            Object.defineProperty(exports2, "__esModule", { value: true });
            exports2.ModuleIDLNode = void 0;
            const ConstantIDLNode_1 = __webpack_require__2(877);
            const IDLNode_1 = __webpack_require__2(165);
            class ModuleIDLNode extends IDLNode_1.IDLNode {
              /** Writes out module to message definition that contains only its directly descendent constant definitions */
              toIDLMessageDefinition() {
                const definitions = this.definitions.flatMap((def) => {
                  if (def instanceof ConstantIDLNode_1.ConstantIDLNode) {
                    return [def.toIDLMessageDefinitionField()];
                  }
                  return [];
                });
                if (definitions.length === 0) {
                  return void 0;
                }
                return {
                  name: this.scopedIdentifier,
                  definitions,
                  aggregatedKind: "module"
                };
              }
              get definitions() {
                return this.astNode.definitions.map((def) => this.getNode([...this.scopePath, this.name], def.name));
              }
            }
            exports2.ModuleIDLNode = ModuleIDLNode;
          })
        ),
        /***/
        506: (
          /***/
          ((module2, __unused_webpack_exports, __webpack_require__2) => {
            (function() {
              function id(x) {
                return x[0];
              }
              const keywords = [
                ,
                "struct",
                "module",
                "enum",
                "const",
                "typedef",
                "union",
                "switch",
                "case",
                "boolean",
                "wstring",
                "string",
                "sequence",
                "TRUE",
                "FALSE",
                "byte",
                "octet",
                "wchar",
                "char",
                "double",
                "float",
                "int8",
                "uint8",
                "int16",
                "uint16",
                "int32",
                "uint32",
                "int64",
                "uint64",
                "unsigned",
                "short",
                "long"
              ];
              const kwObject = keywords.reduce((obj, w) => {
                obj[w] = w;
                return obj;
              }, {});
              const moo = __webpack_require__2(694);
              const lexer = moo.compile({
                SPACE: { match: /\s+/, lineBreaks: true },
                DECIMALEXP: /(?:(?:\d+\.\d*)|(?:\d*\.\d+)|(?:[0-9]+))[eE](?:[+|-])?[0-9]+/,
                DECIMAL: /(?:(?:\d+\.\d*)|(?:\d*\.\d+))/,
                INTEGER: /0[xX][0-9a-fA-F]+|\d+/,
                COMMENT: /(?:\/\/[^\n]*)|(?:\/\*(?:.|\n)+?\*\/)/,
                STRING: { match: /"(?:\\["\\rnu]|[^"\\])*"/, value: (x) => x.slice(1, -1) },
                // remove outside quotes
                LCBR: "{",
                RCBR: "}",
                LBR: "[",
                RBR: "]",
                LT: "<",
                GT: ">",
                LPAR: "(",
                RPAR: ")",
                ":": ":",
                ";": ";",
                ",": ",",
                AT: "@",
                PND: "#",
                PT: ".",
                "/": "/",
                SIGN: /[+-]/,
                EQ: /=[^\n]*?/,
                NAME: { match: /[a-zA-Z_][a-zA-Z0-9_]*(?:\:\:[a-zA-Z][a-zA-Z0-9_]*)*/, type: moo.keywords(kwObject) }
              });
              const tokensToIgnore = ["SPACE", "COMMENT"];
              lexer.next = /* @__PURE__ */ ((next) => () => {
                let token;
                while ((token = next.call(lexer)) && tokensToIgnore.includes(token.type)) {
                }
                return token;
              })(lexer.next);
              function join(d) {
                return d.join("");
              }
              function extend(objs) {
                return objs.filter(Boolean).reduce((r, p) => ({ ...r, ...p }), {});
              }
              function noop() {
                return null;
              }
              function getIntOrConstantValue(d) {
                const int = parseInt(d);
                if (!isNaN(int)) {
                  return int;
                }
                return d?.value ? { usesConstant: true, name: d.value } : void 0;
              }
              var grammar = {
                Lexer: lexer,
                ParserRules: [
                  { "name": "main$ebnf$1$subexpression$1$ebnf$1", "symbols": [] },
                  { "name": "main$ebnf$1$subexpression$1$ebnf$1", "symbols": ["main$ebnf$1$subexpression$1$ebnf$1", "importDcl"], "postprocess": function arrpush(d) {
                    return d[0].concat([d[1]]);
                  } },
                  { "name": "main$ebnf$1$subexpression$1", "symbols": ["main$ebnf$1$subexpression$1$ebnf$1", "definition"] },
                  { "name": "main$ebnf$1", "symbols": ["main$ebnf$1$subexpression$1"] },
                  { "name": "main$ebnf$1$subexpression$2$ebnf$1", "symbols": [] },
                  { "name": "main$ebnf$1$subexpression$2$ebnf$1", "symbols": ["main$ebnf$1$subexpression$2$ebnf$1", "importDcl"], "postprocess": function arrpush(d) {
                    return d[0].concat([d[1]]);
                  } },
                  { "name": "main$ebnf$1$subexpression$2", "symbols": ["main$ebnf$1$subexpression$2$ebnf$1", "definition"] },
                  { "name": "main$ebnf$1", "symbols": ["main$ebnf$1", "main$ebnf$1$subexpression$2"], "postprocess": function arrpush(d) {
                    return d[0].concat([d[1]]);
                  } },
                  {
                    "name": "main",
                    "symbols": ["main$ebnf$1"],
                    "postprocess": (d) => {
                      return d[0].flatMap((inner) => inner[1]);
                    }
                  },
                  { "name": "importDcl$subexpression$1", "symbols": [lexer.has("STRING") ? { type: "STRING" } : STRING] },
                  { "name": "importDcl$subexpression$1$ebnf$1", "symbols": [] },
                  { "name": "importDcl$subexpression$1$ebnf$1$subexpression$1", "symbols": [{ "literal": "/" }, lexer.has("NAME") ? { type: "NAME" } : NAME] },
                  { "name": "importDcl$subexpression$1$ebnf$1", "symbols": ["importDcl$subexpression$1$ebnf$1", "importDcl$subexpression$1$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {
                    return d[0].concat([d[1]]);
                  } },
                  { "name": "importDcl$subexpression$1", "symbols": [{ "literal": "<" }, lexer.has("NAME") ? { type: "NAME" } : NAME, "importDcl$subexpression$1$ebnf$1", { "literal": "." }, { "literal": "idl" }, { "literal": ">" }] },
                  { "name": "importDcl", "symbols": [{ "literal": "#" }, { "literal": "include" }, "importDcl$subexpression$1"], "postprocess": noop },
                  { "name": "moduleDcl$ebnf$1$subexpression$1", "symbols": ["definition"] },
                  { "name": "moduleDcl$ebnf$1", "symbols": ["moduleDcl$ebnf$1$subexpression$1"] },
                  { "name": "moduleDcl$ebnf$1$subexpression$2", "symbols": ["definition"] },
                  { "name": "moduleDcl$ebnf$1", "symbols": ["moduleDcl$ebnf$1", "moduleDcl$ebnf$1$subexpression$2"], "postprocess": function arrpush(d) {
                    return d[0].concat([d[1]]);
                  } },
                  {
                    "name": "moduleDcl",
                    "symbols": [{ "literal": "module" }, "fieldName", { "literal": "{" }, "moduleDcl$ebnf$1", { "literal": "}" }],
                    "postprocess": function processModule(d) {
                      const moduleName = d[1].name;
                      const defs = d[3];
                      return {
                        declarator: "module",
                        name: moduleName,
                        definitions: defs.flat(1)
                      };
                    }
                  },
                  { "name": "definition$subexpression$1", "symbols": ["typeDcl"] },
                  { "name": "definition$subexpression$1", "symbols": ["constantDcl"] },
                  { "name": "definition$subexpression$1", "symbols": ["moduleDcl"] },
                  { "name": "definition$subexpression$1", "symbols": ["union"] },
                  { "name": "definition", "symbols": ["multiAnnotations", "definition$subexpression$1", "semi"], "postprocess": (d) => {
                    const annotations = d[0];
                    const declaration = d[1][0];
                    return extend([annotations, declaration]);
                  } },
                  { "name": "typeDcl$subexpression$1", "symbols": ["struct"] },
                  { "name": "typeDcl$subexpression$1", "symbols": ["typedef"] },
                  { "name": "typeDcl$subexpression$1", "symbols": ["enum"] },
                  { "name": "typeDcl", "symbols": ["typeDcl$subexpression$1"], "postprocess": (d) => d[0][0] },
                  {
                    "name": "union",
                    "symbols": [{ "literal": "union" }, "fieldName", { "literal": "switch" }, { "literal": "(" }, "switchTypedef", { "literal": ")" }, { "literal": "{" }, "switchBody", { "literal": "}" }],
                    "postprocess": (d) => {
                      const name = d[1].name;
                      const switchType = d[4].type;
                      const switchBody = d[7];
                      const allCases = switchBody;
                      const defaultCase = allCases.find((c) => "default" in c);
                      const cases = allCases.filter((c) => "predicates" in c);
                      const unionNode = {
                        declarator: "union",
                        name,
                        switchType,
                        cases
                      };
                      if (defaultCase) {
                        unionNode.defaultCase = defaultCase.default;
                      }
                      return unionNode;
                    }
                  },
                  { "name": "switchTypedef$subexpression$1", "symbols": ["customType"] },
                  { "name": "switchTypedef$subexpression$1", "symbols": ["numericType"] },
                  { "name": "switchTypedef$subexpression$1", "symbols": ["booleanType"] },
                  { "name": "switchTypedef", "symbols": ["switchTypedef$subexpression$1"], "postprocess": (d) => d[0][0] },
                  { "name": "switchBody$ebnf$1", "symbols": ["case"] },
                  { "name": "switchBody$ebnf$1", "symbols": ["switchBody$ebnf$1", "case"], "postprocess": function arrpush(d) {
                    return d[0].concat([d[1]]);
                  } },
                  { "name": "switchBody", "symbols": ["switchBody$ebnf$1"], "postprocess": (d) => d.flat(2) },
                  { "name": "case$ebnf$1", "symbols": ["caseLabel"] },
                  { "name": "case$ebnf$1", "symbols": ["case$ebnf$1", "caseLabel"], "postprocess": function arrpush(d) {
                    return d[0].concat([d[1]]);
                  } },
                  { "name": "case", "symbols": ["case$ebnf$1", "elementSpec", { "literal": ";" }], "postprocess": (d) => {
                    const cases = d[0];
                    const type = d[1];
                    const nonDefaultCases = cases.filter((casePredicate) => casePredicate !== "default");
                    const isDefault = cases.length !== nonDefaultCases.length;
                    const caseArray = [];
                    if (isDefault) {
                      caseArray.push({ default: type });
                    }
                    if (nonDefaultCases.length > 0) {
                      caseArray.push({
                        predicates: nonDefaultCases,
                        type
                      });
                    }
                    return caseArray;
                  } },
                  { "name": "caseLabel$subexpression$1", "symbols": [{ "literal": "case" }, "constExpression", { "literal": ":" }] },
                  { "name": "caseLabel", "symbols": ["caseLabel$subexpression$1"], "postprocess": (d) => d[0][1] },
                  { "name": "caseLabel$subexpression$2", "symbols": [{ "literal": "default" }, { "literal": ":" }] },
                  { "name": "caseLabel", "symbols": ["caseLabel$subexpression$2"], "postprocess": () => "default" },
                  { "name": "elementSpec", "symbols": ["typeDeclaratorWithAnnotations"], "postprocess": (d) => d[0] },
                  { "name": "enum$ebnf$1", "symbols": [] },
                  { "name": "enum$ebnf$1$subexpression$1", "symbols": [{ "literal": "," }, "enumFieldName"] },
                  { "name": "enum$ebnf$1", "symbols": ["enum$ebnf$1", "enum$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {
                    return d[0].concat([d[1]]);
                  } },
                  { "name": "enum", "symbols": [{ "literal": "enum" }, "fieldName", { "literal": "{" }, "enumFieldName", "enum$ebnf$1", { "literal": "}" }], "postprocess": (d) => {
                    const name = d[1].name;
                    const firstMember = d[3];
                    const members = d[4].flat(2).filter((item) => Boolean(item) && item.type !== ",");
                    return {
                      declarator: "enum",
                      name,
                      enumerators: [firstMember, ...members]
                    };
                  } },
                  { "name": "enumFieldName", "symbols": ["multiAnnotations", "fieldName"], "postprocess": (d) => {
                    const annotations = d[0];
                    const name = d[1];
                    return extend([annotations, name]);
                  } },
                  { "name": "struct$ebnf$1", "symbols": [] },
                  { "name": "struct$ebnf$1$subexpression$1", "symbols": ["member"] },
                  { "name": "struct$ebnf$1", "symbols": ["struct$ebnf$1", "struct$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {
                    return d[0].concat([d[1]]);
                  } },
                  { "name": "struct", "symbols": [{ "literal": "struct" }, "fieldName", { "literal": "{" }, "struct$ebnf$1", { "literal": "}" }], "postprocess": (d) => {
                    const name = d[1].name;
                    const definitions = d[3].flat(2).filter((def) => def !== null);
                    return {
                      declarator: "struct",
                      name,
                      definitions
                    };
                  } },
                  { "name": "typedef", "symbols": [{ "literal": "typedef" }, "typeDeclarator"], "postprocess": ([_, definition]) => ({ declarator: "typedef", ...definition }) },
                  { "name": "typeDeclaratorWithAnnotations", "symbols": ["multiAnnotations", "typeDeclarator"], "postprocess": (d) => {
                    const annotations = d[0];
                    const definition = d[1];
                    return extend([annotations, definition]);
                  } },
                  { "name": "typeDeclarator$subexpression$1", "symbols": ["allTypes", "fieldName", "arrayLengths"] },
                  { "name": "typeDeclarator$subexpression$1", "symbols": ["allTypes", "fieldName"] },
                  { "name": "typeDeclarator$subexpression$1", "symbols": ["sequenceType", "fieldName"] },
                  { "name": "typeDeclarator", "symbols": ["typeDeclarator$subexpression$1"], "postprocess": (d) => extend(d[0]) },
                  { "name": "constantDcl", "symbols": ["constType"], "postprocess": (d) => d[0] },
                  { "name": "member", "symbols": ["fieldWithAnnotation", "semi"], "postprocess": (d) => d[0] },
                  { "name": "fieldWithAnnotation", "symbols": ["multiAnnotations", "fieldDcl"], "postprocess": (d) => {
                    const annotations = d[0];
                    const fields = d[1];
                    const finalDefs = fields.map(
                      (def) => extend([annotations, def])
                    );
                    return finalDefs;
                  } },
                  { "name": "fieldDcl$subexpression$1", "symbols": ["allTypes", "multiFieldNames", "arrayLengths"] },
                  { "name": "fieldDcl$subexpression$1", "symbols": ["allTypes", "multiFieldNames"] },
                  { "name": "fieldDcl$subexpression$1", "symbols": ["sequenceType", "multiFieldNames"] },
                  { "name": "fieldDcl", "symbols": ["fieldDcl$subexpression$1"], "postprocess": (d) => {
                    const names = d[0].splice(1, 1)[0];
                    const defs = names.map((nameObj) => ({
                      ...extend([...d[0], nameObj]),
                      declarator: "struct-member"
                    }));
                    return defs;
                  } },
                  { "name": "multiFieldNames$ebnf$1", "symbols": [] },
                  { "name": "multiFieldNames$ebnf$1$subexpression$1", "symbols": [{ "literal": "," }, "fieldName"] },
                  { "name": "multiFieldNames$ebnf$1", "symbols": ["multiFieldNames$ebnf$1", "multiFieldNames$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {
                    return d[0].concat([d[1]]);
                  } },
                  { "name": "multiFieldNames", "symbols": ["fieldName", "multiFieldNames$ebnf$1"], "postprocess": (d) => {
                    const fieldNames = d.flat(2).filter((d2) => d2 !== null && d2.name);
                    return fieldNames;
                  } },
                  { "name": "multiAnnotations$ebnf$1", "symbols": [] },
                  { "name": "multiAnnotations$ebnf$1", "symbols": ["multiAnnotations$ebnf$1", "annotation"], "postprocess": function arrpush(d) {
                    return d[0].concat([d[1]]);
                  } },
                  {
                    "name": "multiAnnotations",
                    "symbols": ["multiAnnotations$ebnf$1"],
                    "postprocess": (d) => {
                      return d[0].length > 0 ? { annotations: d[0].reduce((record, annotation) => {
                        record[annotation.name] = annotation;
                        return record;
                      }, {}) } : null;
                    }
                  },
                  { "name": "annotation$ebnf$1$subexpression$1", "symbols": [{ "literal": "(" }, "annotationParams", { "literal": ")" }] },
                  { "name": "annotation$ebnf$1", "symbols": ["annotation$ebnf$1$subexpression$1"], "postprocess": id },
                  { "name": "annotation$ebnf$1", "symbols": [], "postprocess": function(d) {
                    return null;
                  } },
                  { "name": "annotation", "symbols": ["at", lexer.has("NAME") ? { type: "NAME" } : NAME, "annotation$ebnf$1"], "postprocess": (d) => {
                    const annotationName = d[1].value;
                    const params = d[2] ? d[2][1] : void 0;
                    if (params == void 0) {
                      return { type: "no-params", name: annotationName };
                    }
                    if (Array.isArray(params)) {
                      const namedParamsRecord = extend(params);
                      return {
                        type: "named-params",
                        name: annotationName,
                        namedParams: namedParamsRecord
                      };
                    }
                    return { type: "const-param", value: params, name: annotationName };
                  } },
                  { "name": "annotationParams$subexpression$1", "symbols": ["multipleNamedAnnotationParams"] },
                  { "name": "annotationParams$subexpression$1", "symbols": ["constExpression"] },
                  { "name": "annotationParams", "symbols": ["annotationParams$subexpression$1"], "postprocess": (d) => d[0][0] },
                  { "name": "multipleNamedAnnotationParams$ebnf$1", "symbols": [] },
                  { "name": "multipleNamedAnnotationParams$ebnf$1$subexpression$1", "symbols": [{ "literal": "," }, "namedAnnotationParam"] },
                  { "name": "multipleNamedAnnotationParams$ebnf$1", "symbols": ["multipleNamedAnnotationParams$ebnf$1", "multipleNamedAnnotationParams$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {
                    return d[0].concat([d[1]]);
                  } },
                  {
                    "name": "multipleNamedAnnotationParams",
                    "symbols": ["namedAnnotationParam", "multipleNamedAnnotationParams$ebnf$1"],
                    "postprocess": (d) => [d[0], ...d[1].flatMap(([, param]) => param)]
                    // returns array
                  },
                  {
                    "name": "constExpression",
                    "symbols": [lexer.has("NAME") ? { type: "NAME" } : NAME],
                    "postprocess": (d) => (
                      // should match `variableAssignment` constant usage structure for consistency
                      // between named and const annotation types
                      { usesConstant: true, name: d[0].value }
                    )
                  },
                  { "name": "constExpression", "symbols": ["literal"], "postprocess": (d) => d[0].value },
                  { "name": "namedAnnotationParam$subexpression$1", "symbols": [lexer.has("NAME") ? { type: "NAME" } : NAME, "assignment"] },
                  { "name": "namedAnnotationParam", "symbols": ["namedAnnotationParam$subexpression$1"], "postprocess": (d) => ({ [d[0][0].value]: d[0][1].value }) },
                  { "name": "at", "symbols": [{ "literal": "@" }], "postprocess": noop },
                  { "name": "constType$subexpression$1", "symbols": ["constKeyword", "numericType", "fieldName", "floatAssignment", "simple"] },
                  { "name": "constType$subexpression$1", "symbols": ["constKeyword", "numericType", "fieldName", "intAssignment", "simple"] },
                  { "name": "constType$subexpression$1", "symbols": ["constKeyword", "stringType", "fieldName", "stringAssignment", "simple"] },
                  { "name": "constType$subexpression$1", "symbols": ["constKeyword", "booleanType", "fieldName", "booleanAssignment", "simple"] },
                  { "name": "constType$subexpression$1", "symbols": ["constKeyword", "customType", "fieldName", "variableAssignment", "simple"] },
                  { "name": "constType", "symbols": ["constType$subexpression$1"], "postprocess": (d) => {
                    return extend(d[0]);
                  } },
                  { "name": "constKeyword", "symbols": [{ "literal": "const" }], "postprocess": (d) => ({ isConstant: true, declarator: "const" }) },
                  { "name": "fieldName", "symbols": [lexer.has("NAME") ? { type: "NAME" } : NAME], "postprocess": (d) => ({ name: d[0].value }) },
                  { "name": "sequenceType$ebnf$1$subexpression$1$subexpression$1", "symbols": ["INT"] },
                  { "name": "sequenceType$ebnf$1$subexpression$1$subexpression$1", "symbols": [lexer.has("NAME") ? { type: "NAME" } : NAME] },
                  { "name": "sequenceType$ebnf$1$subexpression$1", "symbols": [{ "literal": "," }, "sequenceType$ebnf$1$subexpression$1$subexpression$1"] },
                  { "name": "sequenceType$ebnf$1", "symbols": ["sequenceType$ebnf$1$subexpression$1"], "postprocess": id },
                  { "name": "sequenceType$ebnf$1", "symbols": [], "postprocess": function(d) {
                    return null;
                  } },
                  { "name": "sequenceType", "symbols": [{ "literal": "sequence" }, { "literal": "<" }, "allTypes", "sequenceType$ebnf$1", { "literal": ">" }], "postprocess": (d) => {
                    const arrayUpperBound = d[3] !== null ? getIntOrConstantValue(d[3][1][0]) : void 0;
                    const typeObj = d[2];
                    return {
                      ...typeObj,
                      isArray: true,
                      arrayUpperBound
                    };
                  } },
                  { "name": "arrayLengths$ebnf$1", "symbols": ["arrayLength"] },
                  { "name": "arrayLengths$ebnf$1", "symbols": ["arrayLengths$ebnf$1", "arrayLength"], "postprocess": function arrpush(d) {
                    return d[0].concat([d[1]]);
                  } },
                  {
                    "name": "arrayLengths",
                    "symbols": ["arrayLengths$ebnf$1"],
                    "postprocess": (d) => {
                      const arrInfo = { isArray: true };
                      const arrLengthList = d.flat(2).filter((num) => num != void 0);
                      arrInfo.arrayLengths = arrLengthList;
                      return arrInfo;
                    }
                  },
                  { "name": "arrayLength$subexpression$1", "symbols": ["INT"] },
                  { "name": "arrayLength$subexpression$1", "symbols": [lexer.has("NAME") ? { type: "NAME" } : NAME] },
                  {
                    "name": "arrayLength",
                    "symbols": [{ "literal": "[" }, "arrayLength$subexpression$1", { "literal": "]" }],
                    "postprocess": ([, intOrName]) => getIntOrConstantValue(intOrName ? intOrName[0] : void 0)
                  },
                  { "name": "assignment$subexpression$1", "symbols": ["floatAssignment"] },
                  { "name": "assignment$subexpression$1", "symbols": ["intAssignment"] },
                  { "name": "assignment$subexpression$1", "symbols": ["stringAssignment"] },
                  { "name": "assignment$subexpression$1", "symbols": ["booleanAssignment"] },
                  { "name": "assignment$subexpression$1", "symbols": ["variableAssignment"] },
                  { "name": "assignment", "symbols": ["assignment$subexpression$1"], "postprocess": (d) => d[0][0] },
                  { "name": "floatAssignment$subexpression$1", "symbols": ["SIGNED_FLOAT"] },
                  { "name": "floatAssignment$subexpression$1", "symbols": ["FLOAT"] },
                  { "name": "floatAssignment", "symbols": [lexer.has("EQ") ? { type: "EQ" } : EQ, "floatAssignment$subexpression$1"], "postprocess": ([, num]) => ({ valueText: num[0], value: parseFloat(num[0]) }) },
                  { "name": "intAssignment$subexpression$1", "symbols": ["SIGNED_INT"] },
                  { "name": "intAssignment$subexpression$1", "symbols": ["INT"] },
                  { "name": "intAssignment", "symbols": [lexer.has("EQ") ? { type: "EQ" } : EQ, "intAssignment$subexpression$1"], "postprocess": ([, num]) => ({ valueText: num[0], value: parseInt(num[0]) }) },
                  { "name": "stringAssignment", "symbols": [lexer.has("EQ") ? { type: "EQ" } : EQ, "STR"], "postprocess": ([, str]) => ({ valueText: str, value: str }) },
                  { "name": "booleanAssignment", "symbols": [lexer.has("EQ") ? { type: "EQ" } : EQ, "BOOLEAN"], "postprocess": ([, bool]) => ({ valueText: bool, value: bool === "TRUE" }) },
                  {
                    "name": "variableAssignment",
                    "symbols": [lexer.has("EQ") ? { type: "EQ" } : EQ, lexer.has("NAME") ? { type: "NAME" } : NAME],
                    "postprocess": ([, name]) => ({
                      valueText: name.value,
                      value: {
                        usesConstant: true,
                        name: name.value
                      }
                    })
                  },
                  { "name": "allTypes$subexpression$1", "symbols": ["primitiveTypes"] },
                  { "name": "allTypes$subexpression$1", "symbols": ["customType"] },
                  { "name": "allTypes", "symbols": ["allTypes$subexpression$1"], "postprocess": (d) => d[0][0] },
                  { "name": "primitiveTypes$subexpression$1", "symbols": ["stringType"] },
                  { "name": "primitiveTypes$subexpression$1", "symbols": ["numericType"] },
                  { "name": "primitiveTypes$subexpression$1", "symbols": ["booleanType"] },
                  { "name": "primitiveTypes", "symbols": ["primitiveTypes$subexpression$1"], "postprocess": (d) => ({ ...d[0][0], isComplex: false }) },
                  { "name": "customType", "symbols": [lexer.has("NAME") ? { type: "NAME" } : NAME], "postprocess": (d) => {
                    const typeName = d[0].value;
                    return { type: typeName };
                  } },
                  { "name": "stringType$subexpression$1", "symbols": [{ "literal": "string" }] },
                  { "name": "stringType$subexpression$1", "symbols": [{ "literal": "wstring" }] },
                  { "name": "stringType$ebnf$1$subexpression$1$subexpression$1", "symbols": ["INT"] },
                  { "name": "stringType$ebnf$1$subexpression$1$subexpression$1", "symbols": [lexer.has("NAME") ? { type: "NAME" } : NAME] },
                  { "name": "stringType$ebnf$1$subexpression$1", "symbols": [{ "literal": "<" }, "stringType$ebnf$1$subexpression$1$subexpression$1", { "literal": ">" }] },
                  { "name": "stringType$ebnf$1", "symbols": ["stringType$ebnf$1$subexpression$1"], "postprocess": id },
                  { "name": "stringType$ebnf$1", "symbols": [], "postprocess": function(d) {
                    return null;
                  } },
                  { "name": "stringType", "symbols": ["stringType$subexpression$1", "stringType$ebnf$1"], "postprocess": (d) => {
                    const stringKind = d[0][0].value;
                    let strLength = void 0;
                    if (d[1] !== null) {
                      strLength = getIntOrConstantValue(d[1][1] ? d[1][1][0] : void 0);
                    }
                    return { type: stringKind, upperBound: strLength };
                  } },
                  { "name": "booleanType", "symbols": [{ "literal": "boolean" }], "postprocess": (d) => ({ type: "bool" }) },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "byte" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "octet" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "wchar" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "char" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "long" }, { "literal": "double" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "double" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "float" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "int8" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "uint8" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "int16" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "uint16" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "int32" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "uint32" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "int64" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "uint64" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "unsigned" }, { "literal": "short" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "short" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "unsigned" }, { "literal": "long" }, { "literal": "long" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "long" }, { "literal": "long" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "unsigned" }, { "literal": "long" }] },
                  { "name": "numericType$subexpression$1", "symbols": [{ "literal": "long" }] },
                  {
                    "name": "numericType",
                    "symbols": ["numericType$subexpression$1"],
                    "postprocess": (d) => {
                      const typeString = d[0].map((t) => t?.value).filter((t) => !!t).join(" ");
                      return { type: typeString };
                    }
                  },
                  { "name": "literal$subexpression$1", "symbols": ["booleanLiteral"] },
                  { "name": "literal$subexpression$1", "symbols": ["strLiteral"] },
                  { "name": "literal$subexpression$1", "symbols": ["floatLiteral"] },
                  { "name": "literal$subexpression$1", "symbols": ["intLiteral"] },
                  { "name": "literal", "symbols": ["literal$subexpression$1"], "postprocess": (d) => d[0][0] },
                  { "name": "booleanLiteral", "symbols": ["BOOLEAN"], "postprocess": (d) => ({ value: d[0] === "TRUE" }) },
                  { "name": "strLiteral", "symbols": ["STR"], "postprocess": (d) => ({ value: d[0] }) },
                  { "name": "floatLiteral$subexpression$1", "symbols": ["SIGNED_FLOAT"] },
                  { "name": "floatLiteral$subexpression$1", "symbols": ["FLOAT"] },
                  { "name": "floatLiteral", "symbols": ["floatLiteral$subexpression$1"], "postprocess": (d) => ({ value: parseFloat(d[0][0]) }) },
                  { "name": "intLiteral$subexpression$1", "symbols": ["SIGNED_INT"] },
                  { "name": "intLiteral$subexpression$1", "symbols": ["INT"] },
                  { "name": "intLiteral", "symbols": ["intLiteral$subexpression$1"], "postprocess": (d) => ({ value: parseInt(d[0][0]) }) },
                  { "name": "BOOLEAN$subexpression$1", "symbols": [{ "literal": "TRUE" }] },
                  { "name": "BOOLEAN$subexpression$1", "symbols": [{ "literal": "FALSE" }] },
                  { "name": "BOOLEAN", "symbols": ["BOOLEAN$subexpression$1"], "postprocess": join },
                  { "name": "STR$ebnf$1", "symbols": [lexer.has("STRING") ? { type: "STRING" } : STRING] },
                  { "name": "STR$ebnf$1", "symbols": ["STR$ebnf$1", lexer.has("STRING") ? { type: "STRING" } : STRING], "postprocess": function arrpush(d) {
                    return d[0].concat([d[1]]);
                  } },
                  { "name": "STR", "symbols": ["STR$ebnf$1"], "postprocess": (d) => {
                    return join(d.flat(1).filter((d2) => d2 !== null));
                  } },
                  { "name": "SIGNED_FLOAT$subexpression$1", "symbols": [{ "literal": "+" }] },
                  { "name": "SIGNED_FLOAT$subexpression$1", "symbols": [{ "literal": "-" }] },
                  { "name": "SIGNED_FLOAT", "symbols": ["SIGNED_FLOAT$subexpression$1", "FLOAT"], "postprocess": join },
                  { "name": "FLOAT$subexpression$1", "symbols": [lexer.has("DECIMAL") ? { type: "DECIMAL" } : DECIMAL] },
                  { "name": "FLOAT$subexpression$1", "symbols": [lexer.has("DECIMALEXP") ? { type: "DECIMALEXP" } : DECIMALEXP] },
                  { "name": "FLOAT", "symbols": ["FLOAT$subexpression$1"], "postprocess": join },
                  { "name": "FLOAT$subexpression$2", "symbols": [lexer.has("DECIMAL") ? { type: "DECIMAL" } : DECIMAL, { "literal": "d" }] },
                  { "name": "FLOAT", "symbols": ["FLOAT$subexpression$2"], "postprocess": (d) => d[0][0].value },
                  { "name": "FLOAT$subexpression$3", "symbols": ["INT", { "literal": "d" }] },
                  { "name": "FLOAT", "symbols": ["FLOAT$subexpression$3"], "postprocess": (d) => d[0][0] },
                  { "name": "SIGNED_INT$subexpression$1", "symbols": [{ "literal": "+" }] },
                  { "name": "SIGNED_INT$subexpression$1", "symbols": [{ "literal": "-" }] },
                  { "name": "SIGNED_INT", "symbols": ["SIGNED_INT$subexpression$1", "INT"], "postprocess": join },
                  { "name": "INT", "symbols": [lexer.has("INTEGER") ? { type: "INTEGER" } : INTEGER], "postprocess": join },
                  { "name": "semi", "symbols": [{ "literal": ";" }], "postprocess": noop },
                  { "name": "simple", "symbols": [], "postprocess": () => ({ isComplex: false }) }
                ],
                ParserStart: "main"
              };
              if (typeof module2.exports !== "undefined") {
                module2.exports = grammar;
              } else {
                window.grammar = grammar;
              }
            })();
          })
        ),
        /***/
        522: (
          /***/
          ((__unused_webpack_module, exports2, __webpack_require__2) => {
            "use strict";
            Object.defineProperty(exports2, "__esModule", { value: true });
            exports2.UnionIDLNode = void 0;
            const IDLNode_1 = __webpack_require__2(165);
            const StructMemberIDLNode_1 = __webpack_require__2(572);
            const primitiveTypes_1 = __webpack_require__2(731);
            class UnionIDLNode extends IDLNode_1.IDLNode {
              switchTypeNeedsResolution = false;
              constructor(scopePath, astNode, idlMap) {
                super(scopePath, astNode, idlMap);
                if (!primitiveTypes_1.SIMPLE_TYPES.has(this.astNode.switchType)) {
                  this.switchTypeNeedsResolution = true;
                }
              }
              get type() {
                return this.astNode.name;
              }
              // eslint-disable-next-line @typescript-eslint/class-literal-property-style
              get isComplex() {
                return true;
              }
              _switchTypeNode;
              switchTypeNode() {
                if (this._switchTypeNode) {
                  return this._switchTypeNode;
                }
                const typeNode = this.getNode(this.scopePath, this.astNode.switchType);
                if (typeNode.declarator !== "enum" && typeNode.declarator !== "typedef") {
                  throw new Error(`Invalid switch type "${typeNode.scopedIdentifier}" ${this.astNode.switchType} in ${this.scopedIdentifier}`);
                }
                this._switchTypeNode = typeNode;
                return typeNode;
              }
              get switchType() {
                let switchType = this.astNode.switchType;
                if (this.switchTypeNeedsResolution) {
                  switchType = this.switchTypeNode().type;
                }
                if (!isValidSwitchType(switchType)) {
                  throw new Error(`Invalid resolved switch type ${switchType} in ${this.scopedIdentifier}`);
                }
                return switchType;
              }
              get cases() {
                const isEnumSwitchType = this.switchTypeNeedsResolution && this.switchTypeNode().declarator === "enum";
                const predicateScopePath = isEnumSwitchType ? this.switchTypeNode().scopedIdentifier.split("::") : this.scopePath;
                return this.astNode.cases.map((def) => {
                  const typeNode = new StructMemberIDLNode_1.StructMemberIDLNode(
                    [...this.scopePath, this.name],
                    { ...def.type, declarator: "struct-member" },
                    // unfortunate shoehorning for struct-member node
                    this.map
                  );
                  const resolvedPredicates = def.predicates.map((predicate) => {
                    if (typeof predicate === "object") {
                      return this.getConstantNode(predicate.name, predicateScopePath).value;
                    }
                    return predicate;
                  });
                  const resolvedType = typeNode.toIDLMessageDefinitionField();
                  return {
                    type: resolvedType,
                    predicates: resolvedPredicates
                  };
                });
              }
              get defaultCase() {
                if (!this.astNode.defaultCase) {
                  return void 0;
                }
                const typeNode = new StructMemberIDLNode_1.StructMemberIDLNode(
                  [...this.scopePath, this.name],
                  { ...this.astNode.defaultCase, declarator: "struct-member" },
                  // unfortunate shoehorning for struct-member node
                  this.map
                );
                return typeNode.toIDLMessageDefinitionField();
              }
              toIDLMessageDefinition() {
                const annotations = this.annotations;
                return {
                  name: this.scopedIdentifier,
                  switchType: (0, primitiveTypes_1.normalizeType)(this.switchType),
                  cases: this.cases,
                  aggregatedKind: "union",
                  ...this.astNode.defaultCase ? { defaultCase: this.defaultCase } : void 0,
                  ...annotations ? { annotations } : void 0
                };
              }
            }
            exports2.UnionIDLNode = UnionIDLNode;
            function isValidSwitchType(type) {
              return primitiveTypes_1.INTEGER_TYPES.has(type) || type === "bool";
            }
          })
        ),
        /***/
        572: (
          /***/
          ((__unused_webpack_module, exports2, __webpack_require__2) => {
            "use strict";
            Object.defineProperty(exports2, "__esModule", { value: true });
            exports2.StructMemberIDLNode = void 0;
            const ReferenceTypeIDLNode_1 = __webpack_require__2(852);
            const primitiveTypes_1 = __webpack_require__2(731);
            class StructMemberIDLNode extends ReferenceTypeIDLNode_1.ReferenceTypeIDLNode {
              /** Writes out ASTNode as a fully resolved IDL message definition */
              toIDLMessageDefinitionField() {
                const msgDefinitionField = {
                  name: this.name,
                  type: (0, primitiveTypes_1.normalizeType)(this.type),
                  isComplex: this.isComplex
                };
                if (this.arrayLengths != void 0) {
                  msgDefinitionField.arrayLengths = this.arrayLengths;
                }
                if (this.arrayUpperBound != void 0) {
                  msgDefinitionField.arrayUpperBound = this.arrayUpperBound;
                }
                if (this.upperBound != void 0) {
                  msgDefinitionField.upperBound = this.upperBound;
                }
                if (this.annotations != void 0) {
                  msgDefinitionField.annotations = this.annotations;
                }
                if (this.isArray != void 0) {
                  msgDefinitionField.isArray = this.isArray;
                }
                if (this.enumType != void 0) {
                  msgDefinitionField.enumType = this.enumType;
                }
                const maybeDefault = this.annotations?.default;
                if (maybeDefault && maybeDefault.type !== "no-params") {
                  const defaultValue = maybeDefault.type === "const-param" ? maybeDefault.value : maybeDefault.namedParams.value;
                  if (typeof defaultValue !== "object") {
                    msgDefinitionField.defaultValue = defaultValue;
                  } else {
                    msgDefinitionField.defaultValue = this.getConstantNode(defaultValue.name).value;
                  }
                }
                return msgDefinitionField;
              }
            }
            exports2.StructMemberIDLNode = StructMemberIDLNode;
          })
        ),
        /***/
        662: (
          /***/
          (function(module2) {
            (function(root, factory) {
              if (module2.exports) {
                module2.exports = factory();
              } else {
                root.nearley = factory();
              }
            })(this, function() {
              function Rule(name, symbols, postprocess) {
                this.id = ++Rule.highestId;
                this.name = name;
                this.symbols = symbols;
                this.postprocess = postprocess;
                return this;
              }
              Rule.highestId = 0;
              Rule.prototype.toString = function(withCursorAt) {
                var symbolSequence = typeof withCursorAt === "undefined" ? this.symbols.map(getSymbolShortDisplay).join(" ") : this.symbols.slice(0, withCursorAt).map(getSymbolShortDisplay).join(" ") + " \u25CF " + this.symbols.slice(withCursorAt).map(getSymbolShortDisplay).join(" ");
                return this.name + " \u2192 " + symbolSequence;
              };
              function State(rule, dot, reference, wantedBy) {
                this.rule = rule;
                this.dot = dot;
                this.reference = reference;
                this.data = [];
                this.wantedBy = wantedBy;
                this.isComplete = this.dot === rule.symbols.length;
              }
              State.prototype.toString = function() {
                return "{" + this.rule.toString(this.dot) + "}, from: " + (this.reference || 0);
              };
              State.prototype.nextState = function(child) {
                var state = new State(this.rule, this.dot + 1, this.reference, this.wantedBy);
                state.left = this;
                state.right = child;
                if (state.isComplete) {
                  state.data = state.build();
                  state.right = void 0;
                }
                return state;
              };
              State.prototype.build = function() {
                var children = [];
                var node = this;
                do {
                  children.push(node.right.data);
                  node = node.left;
                } while (node.left);
                children.reverse();
                return children;
              };
              State.prototype.finish = function() {
                if (this.rule.postprocess) {
                  this.data = this.rule.postprocess(this.data, this.reference, Parser.fail);
                }
              };
              function Column(grammar, index) {
                this.grammar = grammar;
                this.index = index;
                this.states = [];
                this.wants = {};
                this.scannable = [];
                this.completed = {};
              }
              Column.prototype.process = function(nextColumn) {
                var states = this.states;
                var wants = this.wants;
                var completed = this.completed;
                for (var w = 0; w < states.length; w++) {
                  var state = states[w];
                  if (state.isComplete) {
                    state.finish();
                    if (state.data !== Parser.fail) {
                      var wantedBy = state.wantedBy;
                      for (var i = wantedBy.length; i--; ) {
                        var left = wantedBy[i];
                        this.complete(left, state);
                      }
                      if (state.reference === this.index) {
                        var exp = state.rule.name;
                        (this.completed[exp] = this.completed[exp] || []).push(state);
                      }
                    }
                  } else {
                    var exp = state.rule.symbols[state.dot];
                    if (typeof exp !== "string") {
                      this.scannable.push(state);
                      continue;
                    }
                    if (wants[exp]) {
                      wants[exp].push(state);
                      if (completed.hasOwnProperty(exp)) {
                        var nulls = completed[exp];
                        for (var i = 0; i < nulls.length; i++) {
                          var right = nulls[i];
                          this.complete(state, right);
                        }
                      }
                    } else {
                      wants[exp] = [state];
                      this.predict(exp);
                    }
                  }
                }
              };
              Column.prototype.predict = function(exp) {
                var rules = this.grammar.byName[exp] || [];
                for (var i = 0; i < rules.length; i++) {
                  var r = rules[i];
                  var wantedBy = this.wants[exp];
                  var s = new State(r, 0, this.index, wantedBy);
                  this.states.push(s);
                }
              };
              Column.prototype.complete = function(left, right) {
                var copy = left.nextState(right);
                this.states.push(copy);
              };
              function Grammar(rules, start) {
                this.rules = rules;
                this.start = start || this.rules[0].name;
                var byName = this.byName = {};
                this.rules.forEach(function(rule) {
                  if (!byName.hasOwnProperty(rule.name)) {
                    byName[rule.name] = [];
                  }
                  byName[rule.name].push(rule);
                });
              }
              Grammar.fromCompiled = function(rules, start) {
                var lexer = rules.Lexer;
                if (rules.ParserStart) {
                  start = rules.ParserStart;
                  rules = rules.ParserRules;
                }
                var rules = rules.map(function(r) {
                  return new Rule(r.name, r.symbols, r.postprocess);
                });
                var g = new Grammar(rules, start);
                g.lexer = lexer;
                return g;
              };
              function StreamLexer() {
                this.reset("");
              }
              StreamLexer.prototype.reset = function(data, state) {
                this.buffer = data;
                this.index = 0;
                this.line = state ? state.line : 1;
                this.lastLineBreak = state ? -state.col : 0;
              };
              StreamLexer.prototype.next = function() {
                if (this.index < this.buffer.length) {
                  var ch = this.buffer[this.index++];
                  if (ch === "\n") {
                    this.line += 1;
                    this.lastLineBreak = this.index;
                  }
                  return { value: ch };
                }
              };
              StreamLexer.prototype.save = function() {
                return {
                  line: this.line,
                  col: this.index - this.lastLineBreak
                };
              };
              StreamLexer.prototype.formatError = function(token, message) {
                var buffer = this.buffer;
                if (typeof buffer === "string") {
                  var lines = buffer.split("\n").slice(
                    Math.max(0, this.line - 5),
                    this.line
                  );
                  var nextLineBreak = buffer.indexOf("\n", this.index);
                  if (nextLineBreak === -1) nextLineBreak = buffer.length;
                  var col = this.index - this.lastLineBreak;
                  var lastLineDigits = String(this.line).length;
                  message += " at line " + this.line + " col " + col + ":\n\n";
                  message += lines.map(function(line, i) {
                    return pad(this.line - lines.length + i + 1, lastLineDigits) + " " + line;
                  }, this).join("\n");
                  message += "\n" + pad("", lastLineDigits + col) + "^\n";
                  return message;
                } else {
                  return message + " at index " + (this.index - 1);
                }
                function pad(n, length) {
                  var s = String(n);
                  return Array(length - s.length + 1).join(" ") + s;
                }
              };
              function Parser(rules, start, options) {
                if (rules instanceof Grammar) {
                  var grammar = rules;
                  var options = start;
                } else {
                  var grammar = Grammar.fromCompiled(rules, start);
                }
                this.grammar = grammar;
                this.options = {
                  keepHistory: false,
                  lexer: grammar.lexer || new StreamLexer()
                };
                for (var key in options || {}) {
                  this.options[key] = options[key];
                }
                this.lexer = this.options.lexer;
                this.lexerState = void 0;
                var column = new Column(grammar, 0);
                var table = this.table = [column];
                column.wants[grammar.start] = [];
                column.predict(grammar.start);
                column.process();
                this.current = 0;
              }
              Parser.fail = {};
              Parser.prototype.feed = function(chunk) {
                var lexer = this.lexer;
                lexer.reset(chunk, this.lexerState);
                var token;
                while (true) {
                  try {
                    token = lexer.next();
                    if (!token) {
                      break;
                    }
                  } catch (e) {
                    var nextColumn = new Column(this.grammar, this.current + 1);
                    this.table.push(nextColumn);
                    var err2 = new Error(this.reportLexerError(e));
                    err2.offset = this.current;
                    err2.token = e.token;
                    throw err2;
                  }
                  var column = this.table[this.current];
                  if (!this.options.keepHistory) {
                    delete this.table[this.current - 1];
                  }
                  var n = this.current + 1;
                  var nextColumn = new Column(this.grammar, n);
                  this.table.push(nextColumn);
                  var literal = token.text !== void 0 ? token.text : token.value;
                  var value = lexer.constructor === StreamLexer ? token.value : token;
                  var scannable = column.scannable;
                  for (var w = scannable.length; w--; ) {
                    var state = scannable[w];
                    var expect = state.rule.symbols[state.dot];
                    if (expect.test ? expect.test(value) : expect.type ? expect.type === token.type : expect.literal === literal) {
                      var next = state.nextState({ data: value, token, isToken: true, reference: n - 1 });
                      nextColumn.states.push(next);
                    }
                  }
                  nextColumn.process();
                  if (nextColumn.states.length === 0) {
                    var err2 = new Error(this.reportError(token));
                    err2.offset = this.current;
                    err2.token = token;
                    throw err2;
                  }
                  if (this.options.keepHistory) {
                    column.lexerState = lexer.save();
                  }
                  this.current++;
                }
                if (column) {
                  this.lexerState = lexer.save();
                }
                this.results = this.finish();
                return this;
              };
              Parser.prototype.reportLexerError = function(lexerError) {
                var tokenDisplay, lexerMessage;
                var token = lexerError.token;
                if (token) {
                  tokenDisplay = "input " + JSON.stringify(token.text[0]) + " (lexer error)";
                  lexerMessage = this.lexer.formatError(token, "Syntax error");
                } else {
                  tokenDisplay = "input (lexer error)";
                  lexerMessage = lexerError.message;
                }
                return this.reportErrorCommon(lexerMessage, tokenDisplay);
              };
              Parser.prototype.reportError = function(token) {
                var tokenDisplay = (token.type ? token.type + " token: " : "") + JSON.stringify(token.value !== void 0 ? token.value : token);
                var lexerMessage = this.lexer.formatError(token, "Syntax error");
                return this.reportErrorCommon(lexerMessage, tokenDisplay);
              };
              Parser.prototype.reportErrorCommon = function(lexerMessage, tokenDisplay) {
                var lines = [];
                lines.push(lexerMessage);
                var lastColumnIndex = this.table.length - 2;
                var lastColumn = this.table[lastColumnIndex];
                var expectantStates = lastColumn.states.filter(function(state) {
                  var nextSymbol = state.rule.symbols[state.dot];
                  return nextSymbol && typeof nextSymbol !== "string";
                });
                if (expectantStates.length === 0) {
                  lines.push("Unexpected " + tokenDisplay + ". I did not expect any more input. Here is the state of my parse table:\n");
                  this.displayStateStack(lastColumn.states, lines);
                } else {
                  lines.push("Unexpected " + tokenDisplay + ". Instead, I was expecting to see one of the following:\n");
                  var stateStacks = expectantStates.map(function(state) {
                    return this.buildFirstStateStack(state, []) || [state];
                  }, this);
                  stateStacks.forEach(function(stateStack) {
                    var state = stateStack[0];
                    var nextSymbol = state.rule.symbols[state.dot];
                    var symbolDisplay = this.getSymbolDisplay(nextSymbol);
                    lines.push("A " + symbolDisplay + " based on:");
                    this.displayStateStack(stateStack, lines);
                  }, this);
                }
                lines.push("");
                return lines.join("\n");
              };
              Parser.prototype.displayStateStack = function(stateStack, lines) {
                var lastDisplay;
                var sameDisplayCount = 0;
                for (var j = 0; j < stateStack.length; j++) {
                  var state = stateStack[j];
                  var display = state.rule.toString(state.dot);
                  if (display === lastDisplay) {
                    sameDisplayCount++;
                  } else {
                    if (sameDisplayCount > 0) {
                      lines.push("    ^ " + sameDisplayCount + " more lines identical to this");
                    }
                    sameDisplayCount = 0;
                    lines.push("    " + display);
                  }
                  lastDisplay = display;
                }
              };
              Parser.prototype.getSymbolDisplay = function(symbol) {
                return getSymbolLongDisplay(symbol);
              };
              Parser.prototype.buildFirstStateStack = function(state, visited) {
                if (visited.indexOf(state) !== -1) {
                  return null;
                }
                if (state.wantedBy.length === 0) {
                  return [state];
                }
                var prevState = state.wantedBy[0];
                var childVisited = [state].concat(visited);
                var childResult = this.buildFirstStateStack(prevState, childVisited);
                if (childResult === null) {
                  return null;
                }
                return [state].concat(childResult);
              };
              Parser.prototype.save = function() {
                var column = this.table[this.current];
                column.lexerState = this.lexerState;
                return column;
              };
              Parser.prototype.restore = function(column) {
                var index = column.index;
                this.current = index;
                this.table[index] = column;
                this.table.splice(index + 1);
                this.lexerState = column.lexerState;
                this.results = this.finish();
              };
              Parser.prototype.rewind = function(index) {
                if (!this.options.keepHistory) {
                  throw new Error("set option `keepHistory` to enable rewinding");
                }
                this.restore(this.table[index]);
              };
              Parser.prototype.finish = function() {
                var considerations = [];
                var start = this.grammar.start;
                var column = this.table[this.table.length - 1];
                column.states.forEach(function(t) {
                  if (t.rule.name === start && t.dot === t.rule.symbols.length && t.reference === 0 && t.data !== Parser.fail) {
                    considerations.push(t);
                  }
                });
                return considerations.map(function(c) {
                  return c.data;
                });
              };
              function getSymbolLongDisplay(symbol) {
                var type = typeof symbol;
                if (type === "string") {
                  return symbol;
                } else if (type === "object") {
                  if (symbol.literal) {
                    return JSON.stringify(symbol.literal);
                  } else if (symbol instanceof RegExp) {
                    return "character matching " + symbol;
                  } else if (symbol.type) {
                    return symbol.type + " token";
                  } else if (symbol.test) {
                    return "token matching " + String(symbol.test);
                  } else {
                    throw new Error("Unknown symbol type: " + symbol);
                  }
                }
              }
              function getSymbolShortDisplay(symbol) {
                var type = typeof symbol;
                if (type === "string") {
                  return symbol;
                } else if (type === "object") {
                  if (symbol.literal) {
                    return JSON.stringify(symbol.literal);
                  } else if (symbol instanceof RegExp) {
                    return symbol.toString();
                  } else if (symbol.type) {
                    return "%" + symbol.type;
                  } else if (symbol.test) {
                    return "<" + String(symbol.test) + ">";
                  } else {
                    throw new Error("Unknown symbol type: " + symbol);
                  }
                }
              }
              return {
                Parser,
                Grammar,
                Rule
              };
            });
          })
        ),
        /***/
        694: (
          /***/
          (function(module2, exports2) {
            var __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;
            (function(root, factory) {
              if (true) {
                !(__WEBPACK_AMD_DEFINE_ARRAY__ = [], __WEBPACK_AMD_DEFINE_FACTORY__ = factory, __WEBPACK_AMD_DEFINE_RESULT__ = typeof __WEBPACK_AMD_DEFINE_FACTORY__ === "function" ? __WEBPACK_AMD_DEFINE_FACTORY__.apply(exports2, __WEBPACK_AMD_DEFINE_ARRAY__) : __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_RESULT__ !== void 0 && (module2.exports = __WEBPACK_AMD_DEFINE_RESULT__));
              } else {
              }
            })(this, function() {
              "use strict";
              var hasOwnProperty = Object.prototype.hasOwnProperty;
              var toString = Object.prototype.toString;
              var hasSticky = typeof new RegExp().sticky === "boolean";
              function isRegExp(o) {
                return o && toString.call(o) === "[object RegExp]";
              }
              function isObject(o) {
                return o && typeof o === "object" && !isRegExp(o) && !Array.isArray(o);
              }
              function reEscape(s) {
                return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
              }
              function reGroups(s) {
                var re = new RegExp("|" + s);
                return re.exec("").length - 1;
              }
              function reCapture(s) {
                return "(" + s + ")";
              }
              function reUnion(regexps) {
                if (!regexps.length) return "(?!)";
                var source = regexps.map(function(s) {
                  return "(?:" + s + ")";
                }).join("|");
                return "(?:" + source + ")";
              }
              function regexpOrLiteral(obj) {
                if (typeof obj === "string") {
                  return "(?:" + reEscape(obj) + ")";
                } else if (isRegExp(obj)) {
                  if (obj.ignoreCase) throw new Error("RegExp /i flag not allowed");
                  if (obj.global) throw new Error("RegExp /g flag is implied");
                  if (obj.sticky) throw new Error("RegExp /y flag is implied");
                  if (obj.multiline) throw new Error("RegExp /m flag is implied");
                  return obj.source;
                } else {
                  throw new Error("Not a pattern: " + obj);
                }
              }
              function pad(s, length) {
                if (s.length > length) {
                  return s;
                }
                return Array(length - s.length + 1).join(" ") + s;
              }
              function lastNLines(string, numLines) {
                var position = string.length;
                var lineBreaks = 0;
                while (true) {
                  var idx = string.lastIndexOf("\n", position - 1);
                  if (idx === -1) {
                    break;
                  } else {
                    lineBreaks++;
                  }
                  position = idx;
                  if (lineBreaks === numLines) {
                    break;
                  }
                  if (position === 0) {
                    break;
                  }
                }
                var startPosition = lineBreaks < numLines ? 0 : position + 1;
                return string.substring(startPosition).split("\n");
              }
              function objectToRules(object) {
                var keys = Object.getOwnPropertyNames(object);
                var result = [];
                for (var i = 0; i < keys.length; i++) {
                  var key = keys[i];
                  var thing = object[key];
                  var rules = [].concat(thing);
                  if (key === "include") {
                    for (var j = 0; j < rules.length; j++) {
                      result.push({ include: rules[j] });
                    }
                    continue;
                  }
                  var match = [];
                  rules.forEach(function(rule) {
                    if (isObject(rule)) {
                      if (match.length) result.push(ruleOptions(key, match));
                      result.push(ruleOptions(key, rule));
                      match = [];
                    } else {
                      match.push(rule);
                    }
                  });
                  if (match.length) result.push(ruleOptions(key, match));
                }
                return result;
              }
              function arrayToRules(array) {
                var result = [];
                for (var i = 0; i < array.length; i++) {
                  var obj = array[i];
                  if (obj.include) {
                    var include = [].concat(obj.include);
                    for (var j = 0; j < include.length; j++) {
                      result.push({ include: include[j] });
                    }
                    continue;
                  }
                  if (!obj.type) {
                    throw new Error("Rule has no type: " + JSON.stringify(obj));
                  }
                  result.push(ruleOptions(obj.type, obj));
                }
                return result;
              }
              function ruleOptions(type, obj) {
                if (!isObject(obj)) {
                  obj = { match: obj };
                }
                if (obj.include) {
                  throw new Error("Matching rules cannot also include states");
                }
                var options = {
                  defaultType: type,
                  lineBreaks: !!obj.error || !!obj.fallback,
                  pop: false,
                  next: null,
                  push: null,
                  error: false,
                  fallback: false,
                  value: null,
                  type: null,
                  shouldThrow: false
                };
                for (var key in obj) {
                  if (hasOwnProperty.call(obj, key)) {
                    options[key] = obj[key];
                  }
                }
                if (typeof options.type === "string" && type !== options.type) {
                  throw new Error("Type transform cannot be a string (type '" + options.type + "' for token '" + type + "')");
                }
                var match = options.match;
                options.match = Array.isArray(match) ? match : match ? [match] : [];
                options.match.sort(function(a, b) {
                  return isRegExp(a) && isRegExp(b) ? 0 : isRegExp(b) ? -1 : isRegExp(a) ? 1 : b.length - a.length;
                });
                return options;
              }
              function toRules(spec) {
                return Array.isArray(spec) ? arrayToRules(spec) : objectToRules(spec);
              }
              var defaultErrorRule = ruleOptions("error", { lineBreaks: true, shouldThrow: true });
              function compileRules(rules, hasStates) {
                var errorRule = null;
                var fast = /* @__PURE__ */ Object.create(null);
                var fastAllowed = true;
                var unicodeFlag = null;
                var groups = [];
                var parts = [];
                for (var i = 0; i < rules.length; i++) {
                  if (rules[i].fallback) {
                    fastAllowed = false;
                  }
                }
                for (var i = 0; i < rules.length; i++) {
                  var options = rules[i];
                  if (options.include) {
                    throw new Error("Inheritance is not allowed in stateless lexers");
                  }
                  if (options.error || options.fallback) {
                    if (errorRule) {
                      if (!options.fallback === !errorRule.fallback) {
                        throw new Error("Multiple " + (options.fallback ? "fallback" : "error") + " rules not allowed (for token '" + options.defaultType + "')");
                      } else {
                        throw new Error("fallback and error are mutually exclusive (for token '" + options.defaultType + "')");
                      }
                    }
                    errorRule = options;
                  }
                  var match = options.match.slice();
                  if (fastAllowed) {
                    while (match.length && typeof match[0] === "string" && match[0].length === 1) {
                      var word = match.shift();
                      fast[word.charCodeAt(0)] = options;
                    }
                  }
                  if (options.pop || options.push || options.next) {
                    if (!hasStates) {
                      throw new Error("State-switching options are not allowed in stateless lexers (for token '" + options.defaultType + "')");
                    }
                    if (options.fallback) {
                      throw new Error("State-switching options are not allowed on fallback tokens (for token '" + options.defaultType + "')");
                    }
                  }
                  if (match.length === 0) {
                    continue;
                  }
                  fastAllowed = false;
                  groups.push(options);
                  for (var j = 0; j < match.length; j++) {
                    var obj = match[j];
                    if (!isRegExp(obj)) {
                      continue;
                    }
                    if (unicodeFlag === null) {
                      unicodeFlag = obj.unicode;
                    } else if (unicodeFlag !== obj.unicode && options.fallback === false) {
                      throw new Error("If one rule is /u then all must be");
                    }
                  }
                  var pat = reUnion(match.map(regexpOrLiteral));
                  var regexp = new RegExp(pat);
                  if (regexp.test("")) {
                    throw new Error("RegExp matches empty string: " + regexp);
                  }
                  var groupCount = reGroups(pat);
                  if (groupCount > 0) {
                    throw new Error("RegExp has capture groups: " + regexp + "\nUse (?: \u2026 ) instead");
                  }
                  if (!options.lineBreaks && regexp.test("\n")) {
                    throw new Error("Rule should declare lineBreaks: " + regexp);
                  }
                  parts.push(reCapture(pat));
                }
                var fallbackRule = errorRule && errorRule.fallback;
                var flags = hasSticky && !fallbackRule ? "ym" : "gm";
                var suffix = hasSticky || fallbackRule ? "" : "|";
                if (unicodeFlag === true) flags += "u";
                var combined = new RegExp(reUnion(parts) + suffix, flags);
                return { regexp: combined, groups, fast, error: errorRule || defaultErrorRule };
              }
              function compile(rules) {
                var result = compileRules(toRules(rules));
                return new Lexer({ start: result }, "start");
              }
              function checkStateGroup(g, name, map) {
                var state = g && (g.push || g.next);
                if (state && !map[state]) {
                  throw new Error("Missing state '" + state + "' (in token '" + g.defaultType + "' of state '" + name + "')");
                }
                if (g && g.pop && +g.pop !== 1) {
                  throw new Error("pop must be 1 (in token '" + g.defaultType + "' of state '" + name + "')");
                }
              }
              function compileStates(states, start) {
                var all = states.$all ? toRules(states.$all) : [];
                delete states.$all;
                var keys = Object.getOwnPropertyNames(states);
                if (!start) start = keys[0];
                var ruleMap = /* @__PURE__ */ Object.create(null);
                for (var i = 0; i < keys.length; i++) {
                  var key = keys[i];
                  ruleMap[key] = toRules(states[key]).concat(all);
                }
                for (var i = 0; i < keys.length; i++) {
                  var key = keys[i];
                  var rules = ruleMap[key];
                  var included = /* @__PURE__ */ Object.create(null);
                  for (var j = 0; j < rules.length; j++) {
                    var rule = rules[j];
                    if (!rule.include) continue;
                    var splice = [j, 1];
                    if (rule.include !== key && !included[rule.include]) {
                      included[rule.include] = true;
                      var newRules = ruleMap[rule.include];
                      if (!newRules) {
                        throw new Error("Cannot include nonexistent state '" + rule.include + "' (in state '" + key + "')");
                      }
                      for (var k = 0; k < newRules.length; k++) {
                        var newRule = newRules[k];
                        if (rules.indexOf(newRule) !== -1) continue;
                        splice.push(newRule);
                      }
                    }
                    rules.splice.apply(rules, splice);
                    j--;
                  }
                }
                var map = /* @__PURE__ */ Object.create(null);
                for (var i = 0; i < keys.length; i++) {
                  var key = keys[i];
                  map[key] = compileRules(ruleMap[key], true);
                }
                for (var i = 0; i < keys.length; i++) {
                  var name = keys[i];
                  var state = map[name];
                  var groups = state.groups;
                  for (var j = 0; j < groups.length; j++) {
                    checkStateGroup(groups[j], name, map);
                  }
                  var fastKeys = Object.getOwnPropertyNames(state.fast);
                  for (var j = 0; j < fastKeys.length; j++) {
                    checkStateGroup(state.fast[fastKeys[j]], name, map);
                  }
                }
                return new Lexer(map, start);
              }
              function keywordTransform(map) {
                var isMap = typeof Map !== "undefined";
                var reverseMap = isMap ? /* @__PURE__ */ new Map() : /* @__PURE__ */ Object.create(null);
                var types = Object.getOwnPropertyNames(map);
                for (var i = 0; i < types.length; i++) {
                  var tokenType = types[i];
                  var item = map[tokenType];
                  var keywordList = Array.isArray(item) ? item : [item];
                  keywordList.forEach(function(keyword) {
                    if (typeof keyword !== "string") {
                      throw new Error("keyword must be string (in keyword '" + tokenType + "')");
                    }
                    if (isMap) {
                      reverseMap.set(keyword, tokenType);
                    } else {
                      reverseMap[keyword] = tokenType;
                    }
                  });
                }
                return function(k) {
                  return isMap ? reverseMap.get(k) : reverseMap[k];
                };
              }
              var Lexer = function(states, state) {
                this.startState = state;
                this.states = states;
                this.buffer = "";
                this.stack = [];
                this.reset();
              };
              Lexer.prototype.reset = function(data, info) {
                this.buffer = data || "";
                this.index = 0;
                this.line = info ? info.line : 1;
                this.col = info ? info.col : 1;
                this.queuedToken = info ? info.queuedToken : null;
                this.queuedText = info ? info.queuedText : "";
                this.queuedThrow = info ? info.queuedThrow : null;
                this.setState(info ? info.state : this.startState);
                this.stack = info && info.stack ? info.stack.slice() : [];
                return this;
              };
              Lexer.prototype.save = function() {
                return {
                  line: this.line,
                  col: this.col,
                  state: this.state,
                  stack: this.stack.slice(),
                  queuedToken: this.queuedToken,
                  queuedText: this.queuedText,
                  queuedThrow: this.queuedThrow
                };
              };
              Lexer.prototype.setState = function(state) {
                if (!state || this.state === state) return;
                this.state = state;
                var info = this.states[state];
                this.groups = info.groups;
                this.error = info.error;
                this.re = info.regexp;
                this.fast = info.fast;
              };
              Lexer.prototype.popState = function() {
                this.setState(this.stack.pop());
              };
              Lexer.prototype.pushState = function(state) {
                this.stack.push(this.state);
                this.setState(state);
              };
              var eat = hasSticky ? function(re, buffer) {
                return re.exec(buffer);
              } : function(re, buffer) {
                var match = re.exec(buffer);
                if (match[0].length === 0) {
                  return null;
                }
                return match;
              };
              Lexer.prototype._getGroup = function(match) {
                var groupCount = this.groups.length;
                for (var i = 0; i < groupCount; i++) {
                  if (match[i + 1] !== void 0) {
                    return this.groups[i];
                  }
                }
                throw new Error("Cannot find token type for matched text");
              };
              function tokenToString() {
                return this.value;
              }
              Lexer.prototype.next = function() {
                var index = this.index;
                if (this.queuedGroup) {
                  var token = this._token(this.queuedGroup, this.queuedText, index);
                  this.queuedGroup = null;
                  this.queuedText = "";
                  return token;
                }
                var buffer = this.buffer;
                if (index === buffer.length) {
                  return;
                }
                var group = this.fast[buffer.charCodeAt(index)];
                if (group) {
                  return this._token(group, buffer.charAt(index), index);
                }
                var re = this.re;
                re.lastIndex = index;
                var match = eat(re, buffer);
                var error = this.error;
                if (match == null) {
                  return this._token(error, buffer.slice(index, buffer.length), index);
                }
                var group = this._getGroup(match);
                var text = match[0];
                if (error.fallback && match.index !== index) {
                  this.queuedGroup = group;
                  this.queuedText = text;
                  return this._token(error, buffer.slice(index, match.index), index);
                }
                return this._token(group, text, index);
              };
              Lexer.prototype._token = function(group, text, offset) {
                var lineBreaks = 0;
                if (group.lineBreaks) {
                  var matchNL = /\n/g;
                  var nl = 1;
                  if (text === "\n") {
                    lineBreaks = 1;
                  } else {
                    while (matchNL.exec(text)) {
                      lineBreaks++;
                      nl = matchNL.lastIndex;
                    }
                  }
                }
                var token = {
                  type: typeof group.type === "function" && group.type(text) || group.defaultType,
                  value: typeof group.value === "function" ? group.value(text) : text,
                  text,
                  toString: tokenToString,
                  offset,
                  lineBreaks,
                  line: this.line,
                  col: this.col
                };
                var size = text.length;
                this.index += size;
                this.line += lineBreaks;
                if (lineBreaks !== 0) {
                  this.col = size - nl + 1;
                } else {
                  this.col += size;
                }
                if (group.shouldThrow) {
                  var err2 = new Error(this.formatError(token, "invalid syntax"));
                  throw err2;
                }
                if (group.pop) this.popState();
                else if (group.push) this.pushState(group.push);
                else if (group.next) this.setState(group.next);
                return token;
              };
              if (typeof Symbol !== "undefined" && Symbol.iterator) {
                var LexerIterator = function(lexer) {
                  this.lexer = lexer;
                };
                LexerIterator.prototype.next = function() {
                  var token = this.lexer.next();
                  return { value: token, done: !token };
                };
                LexerIterator.prototype[Symbol.iterator] = function() {
                  return this;
                };
                Lexer.prototype[Symbol.iterator] = function() {
                  return new LexerIterator(this);
                };
              }
              Lexer.prototype.formatError = function(token, message) {
                if (token == null) {
                  var text = this.buffer.slice(this.index);
                  var token = {
                    text,
                    offset: this.index,
                    lineBreaks: text.indexOf("\n") === -1 ? 0 : 1,
                    line: this.line,
                    col: this.col
                  };
                }
                var numLinesAround = 2;
                var firstDisplayedLine = Math.max(token.line - numLinesAround, 1);
                var lastDisplayedLine = token.line + numLinesAround;
                var lastLineDigits = String(lastDisplayedLine).length;
                var displayedLines = lastNLines(
                  this.buffer,
                  this.line - token.line + numLinesAround + 1
                ).slice(0, 5);
                var errorLines = [];
                errorLines.push(message + " at line " + token.line + " col " + token.col + ":");
                errorLines.push("");
                for (var i = 0; i < displayedLines.length; i++) {
                  var line = displayedLines[i];
                  var lineNo = firstDisplayedLine + i;
                  errorLines.push(pad(String(lineNo), lastLineDigits) + "  " + line);
                  if (lineNo === token.line) {
                    errorLines.push(pad("", lastLineDigits + token.col + 1) + "^");
                  }
                }
                return errorLines.join("\n");
              };
              Lexer.prototype.clone = function() {
                return new Lexer(this.states, this.state);
              };
              Lexer.prototype.has = function(tokenType) {
                return true;
              };
              return {
                compile,
                states: compileStates,
                error: Object.freeze({ error: true }),
                fallback: Object.freeze({ fallback: true }),
                keywords: keywordTransform
              };
            });
          })
        ),
        /***/
        731: (
          /***/
          ((__unused_webpack_module, exports2) => {
            "use strict";
            Object.defineProperty(exports2, "__esModule", { value: true });
            exports2.SIMPLE_TYPES = exports2.INTEGER_TYPES = void 0;
            exports2.normalizeType = normalizeType;
            const numericTypeMap = {
              "unsigned short": "uint16",
              "unsigned long": "uint32",
              "unsigned long long": "uint64",
              short: "int16",
              long: "int32",
              "long long": "int64",
              double: "float64",
              float: "float32",
              octet: "uint8",
              char: "uint8",
              byte: "int8"
            };
            exports2.INTEGER_TYPES = /* @__PURE__ */ new Set([
              "int8",
              "uint8",
              "int16",
              "uint16",
              "int32",
              "uint32",
              "int64",
              "uint64",
              "byte",
              "octet",
              "unsigned short",
              "unsigned long",
              "unsigned long long",
              "short",
              "long",
              "long long"
            ]);
            exports2.SIMPLE_TYPES = /* @__PURE__ */ new Set([
              "bool",
              "string",
              "wstring",
              "int8",
              "uint8",
              "int16",
              "uint16",
              "int32",
              "uint32",
              "int64",
              "uint64",
              "wchar",
              ...Object.keys(numericTypeMap)
            ]);
            function normalizeType(type) {
              const toType = numericTypeMap[type];
              if (toType != void 0) {
                return toType;
              }
              return type;
            }
          })
        ),
        /***/
        774: (
          /***/
          ((__unused_webpack_module, exports2, __webpack_require__2) => {
            "use strict";
            Object.defineProperty(exports2, "__esModule", { value: true });
            exports2.EnumIDLNode = void 0;
            const IDLNode_1 = __webpack_require__2(165);
            class EnumIDLNode extends IDLNode_1.IDLNode {
              // eslint-disable-next-line @typescript-eslint/class-literal-property-style
              get type() {
                return "uint32";
              }
              enumeratorNodes() {
                return this.astNode.enumerators.map((enumerator) => this.getConstantNode((0, IDLNode_1.toScopedIdentifier)([...this.scopePath, this.name, enumerator.name])));
              }
              toIDLMessageDefinition() {
                const definitions = this.enumeratorNodes().map((enumerator) => enumerator.toIDLMessageDefinitionField());
                return {
                  name: (0, IDLNode_1.toScopedIdentifier)([...this.scopePath, this.name]),
                  definitions,
                  // Going to use the module aggregated kind since that's what we store constants in
                  aggregatedKind: "module"
                };
              }
            }
            exports2.EnumIDLNode = EnumIDLNode;
          })
        ),
        /***/
        791: (
          /***/
          ((__unused_webpack_module, exports2, __webpack_require__2) => {
            "use strict";
            Object.defineProperty(exports2, "__esModule", { value: true });
            exports2.parseIDL = parseIDL2;
            const parseIDLToAST_1 = __webpack_require__2(128);
            const processIDL_1 = __webpack_require__2(177);
            function parseIDL2(messageDefinition) {
              const rawIDLDefinitions = (0, parseIDLToAST_1.parseIDLToAST)(messageDefinition);
              const idlMap = (0, processIDL_1.buildMap)(rawIDLDefinitions);
              return (0, processIDL_1.toIDLMessageDefinitions)(idlMap);
            }
          })
        ),
        /***/
        836: (
          /***/
          (function(__unused_webpack_module, exports2, __webpack_require__2) {
            "use strict";
            var __importDefault = this && this.__importDefault || function(mod) {
              return mod && mod.__esModule ? mod : { "default": mod };
            };
            Object.defineProperty(exports2, "__esModule", { value: true });
            exports2.IDL_GRAMMAR = void 0;
            const nearley_1 = __webpack_require__2(662);
            const idl_ne_1 = __importDefault(__webpack_require__2(506));
            exports2.IDL_GRAMMAR = nearley_1.Grammar.fromCompiled(idl_ne_1.default);
          })
        ),
        /***/
        852: (
          /***/
          ((__unused_webpack_module, exports2, __webpack_require__2) => {
            "use strict";
            Object.defineProperty(exports2, "__esModule", { value: true });
            exports2.ReferenceTypeIDLNode = void 0;
            const IDLNode_1 = __webpack_require__2(165);
            const primitiveTypes_1 = __webpack_require__2(731);
            class ReferenceTypeIDLNode extends IDLNode_1.IDLNode {
              /** Indicates that it references another typedef, enum or struct. (ie: uses a non-builtin / simple type) */
              typeNeedsResolution = false;
              /** Used to hold an optional referenced node if needsResolution==true. Resolved/Set with `typeRef()` function.
               * Not meant to be used outside of `typeRef()` function.
               */
              typeRefNode;
              constructor(scopePath, astNode, idlMap) {
                super(scopePath, astNode, idlMap);
                if (!primitiveTypes_1.SIMPLE_TYPES.has(astNode.type)) {
                  this.typeNeedsResolution = true;
                }
              }
              get type() {
                if (this.typeNeedsResolution) {
                  const parent = this.typeRef();
                  if (parent.declarator === "typedef" || parent.declarator === "enum") {
                    return parent.type;
                  }
                  return parent.scopedIdentifier;
                }
                return this.astNode.type;
              }
              get isComplex() {
                if (!this.typeNeedsResolution) {
                  return false;
                }
                const parent = this.typeRef();
                if (parent.declarator === "typedef") {
                  return parent.isComplex;
                }
                return parent.declarator === "struct" || parent.declarator === "union";
              }
              get enumType() {
                if (this.typeNeedsResolution) {
                  const parent = this.typeRef();
                  if (parent.declarator === "enum") {
                    return parent.scopedIdentifier;
                  }
                }
                return void 0;
              }
              get isArray() {
                let isArray = this.astNode.isArray;
                if (this.typeNeedsResolution) {
                  const parent = this.typeRef();
                  if (parent.declarator === "typedef") {
                    isArray ||= parent.isArray;
                  }
                }
                return isArray;
              }
              get arrayLengths() {
                const arrayLengths = this.astNode.arrayLengths ? [...this.astNode.arrayLengths] : [];
                if (this.typeNeedsResolution) {
                  const parent = this.typeRef();
                  if (parent.declarator === "typedef" && parent.arrayLengths) {
                    arrayLengths.push(...parent.arrayLengths);
                  }
                }
                const finalArrayLengths = [];
                for (const arrayLength of arrayLengths) {
                  const resolvedArrayLength = this.resolvePossibleNumericConstantUsage(arrayLength);
                  if (resolvedArrayLength != void 0) {
                    finalArrayLengths.push(resolvedArrayLength);
                  }
                }
                return finalArrayLengths.length > 0 ? finalArrayLengths : void 0;
              }
              get arrayUpperBound() {
                let arrayUpperBound = void 0;
                if (this.typeNeedsResolution) {
                  const parent = this.typeRef();
                  if (parent.declarator === "typedef") {
                    arrayUpperBound = parent.arrayUpperBound;
                  }
                }
                if (this.astNode.arrayUpperBound != void 0) {
                  arrayUpperBound = this.astNode.arrayUpperBound;
                }
                return this.resolvePossibleNumericConstantUsage(arrayUpperBound);
              }
              get upperBound() {
                let upperBound = void 0;
                if (this.typeNeedsResolution) {
                  const parent = this.typeRef();
                  if (parent.declarator === "typedef") {
                    upperBound = parent.upperBound;
                  }
                }
                if (this.astNode.upperBound != void 0) {
                  upperBound = this.astNode.upperBound;
                }
                return this.resolvePossibleNumericConstantUsage(upperBound);
              }
              get annotations() {
                let annotations = void 0;
                if (this.typeNeedsResolution) {
                  const parent = this.typeRef();
                  if (parent.declarator === "typedef" && parent.annotations != void 0) {
                    annotations = { ...parent.annotations };
                  }
                }
                if (this.astNode.annotations != void 0) {
                  annotations = { ...annotations, ...this.astNode.annotations };
                }
                return annotations;
              }
              resolvePossibleNumericConstantUsage(astValue) {
                if (typeof astValue === "number" || astValue == void 0) {
                  return astValue;
                }
                const constantNodeIdentifier = astValue.name;
                const constantNodeValue = this.getConstantNode(constantNodeIdentifier).value;
                if (typeof constantNodeValue !== "number") {
                  throw Error(`Expected constant value ${constantNodeIdentifier} in ${this.scopedIdentifier} to be a number, but got ${constantNodeValue.toString()}`);
                }
                return constantNodeValue;
              }
              /** Gets Node with the given name in the current instance's scope and checks that it is a valid type reference node */
              getValidTypeReference(typeName) {
                const maybeValidParent = this.getNode(this.scopePath, typeName);
                if (!(maybeValidParent.declarator === "struct") && !(maybeValidParent.declarator === "typedef") && !(maybeValidParent.declarator === "union") && !(maybeValidParent.declarator === "enum")) {
                  throw new Error(`Expected ${typeName} to be non-module, non-constant type in ${this.scopedIdentifier}`);
                }
                return maybeValidParent;
              }
              /** Resolves to a type reference node value or fails if one is not found.
               * Only to be used when needsResolution==true and the `type` on the astNode is not "simple".
               * Also checks the parent against current serialization limitations. (ie: we do not support composing variable length arrays with typedefs)
               */
              typeRef() {
                this.typeRefNode ??= this.getValidTypeReference(this.astNode.type);
                if (!(this.typeRefNode instanceof ReferenceTypeIDLNode)) {
                  return this.typeRefNode;
                }
                if (this.astNode.isArray === true && this.typeRefNode.isArray === true) {
                  const thisNodeIsFixedSize = this.astNode.arrayLengths != void 0;
                  const parentNodeIsFixedSize = this.typeRefNode.arrayLengths != void 0;
                  if (!thisNodeIsFixedSize || !parentNodeIsFixedSize) {
                    throw new Error(`We do not support composing variable length arrays with typedefs: ${this.scopedIdentifier} referencing ${this.typeRefNode.scopedIdentifier}`);
                  }
                }
                return this.typeRefNode;
              }
            }
            exports2.ReferenceTypeIDLNode = ReferenceTypeIDLNode;
          })
        ),
        /***/
        877: (
          /***/
          ((__unused_webpack_module, exports2, __webpack_require__2) => {
            "use strict";
            Object.defineProperty(exports2, "__esModule", { value: true });
            exports2.ConstantIDLNode = void 0;
            const EnumIDLNode_1 = __webpack_require__2(774);
            const IDLNode_1 = __webpack_require__2(165);
            const primitiveTypes_1 = __webpack_require__2(731);
            class ConstantIDLNode extends IDLNode_1.IDLNode {
              /** If the type needs resolution (not simple primitive) this will be set to true. Should only ever mean that it's referencing an enum */
              typeNeedsResolution = false;
              constructor(scopePath, astNode, idlMap) {
                super(scopePath, astNode, idlMap);
                if (!primitiveTypes_1.SIMPLE_TYPES.has(astNode.type)) {
                  this.typeNeedsResolution = true;
                }
              }
              get type() {
                if (this.typeNeedsResolution) {
                  return this.getReferencedEnumNode().type;
                }
                return this.astNode.type;
              }
              /** Holds reference so that it doesn't need to be searched for again */
              referencedEnumNode = void 0;
              /** Gets enum node referenced by type. Fails otherwise. */
              getReferencedEnumNode() {
                if (this.referencedEnumNode == void 0) {
                  const maybeEnumNode = this.getNode(this.scopePath, this.astNode.type);
                  if (!(maybeEnumNode instanceof EnumIDLNode_1.EnumIDLNode)) {
                    throw new Error(`Expected ${this.astNode.type} to be an enum in ${this.scopedIdentifier}`);
                  }
                  this.referencedEnumNode = maybeEnumNode;
                }
                return this.referencedEnumNode;
              }
              // eslint-disable-next-line @typescript-eslint/class-literal-property-style
              get isConstant() {
                return true;
              }
              /** Return Literal value on astNode or if the constant references another constant, then it gets the value that constant uses */
              get value() {
                if (typeof this.astNode.value === "object") {
                  return this.getConstantNode(this.astNode.value.name).value;
                }
                return this.astNode.value;
              }
              /** Writes resolved IDLMessageDefinition */
              toIDLMessageDefinitionField() {
                return {
                  name: this.name,
                  type: (0, primitiveTypes_1.normalizeType)(this.type),
                  value: this.value,
                  isConstant: true,
                  isComplex: false,
                  ...this.astNode.valueText != void 0 ? { valueText: this.astNode.valueText } : void 0
                };
              }
            }
            exports2.ConstantIDLNode = ConstantIDLNode;
          })
        ),
        /***/
        881: (
          /***/
          (function(__unused_webpack_module, exports2, __webpack_require__2) {
            "use strict";
            var __createBinding = this && this.__createBinding || (Object.create ? (function(o, m, k, k2) {
              if (k2 === void 0) k2 = k;
              var desc = Object.getOwnPropertyDescriptor(m, k);
              if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                desc = { enumerable: true, get: function() {
                  return m[k];
                } };
              }
              Object.defineProperty(o, k2, desc);
            }) : (function(o, m, k, k2) {
              if (k2 === void 0) k2 = k;
              o[k2] = m[k];
            }));
            var __exportStar = this && this.__exportStar || function(m, exports3) {
              for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
            };
            Object.defineProperty(exports2, "__esModule", { value: true });
            __exportStar(__webpack_require__2(791), exports2);
            __exportStar(__webpack_require__2(428), exports2);
          })
        )
        /******/
      };
      var __webpack_module_cache__ = {};
      function __webpack_require__(moduleId) {
        var cachedModule = __webpack_module_cache__[moduleId];
        if (cachedModule !== void 0) {
          return cachedModule.exports;
        }
        var module2 = __webpack_module_cache__[moduleId] = {
          /******/
          // no module.id needed
          /******/
          // no module.loaded needed
          /******/
          exports: {}
          /******/
        };
        __webpack_modules__[moduleId].call(module2.exports, module2, module2.exports, __webpack_require__);
        return module2.exports;
      }
      var __webpack_exports__ = __webpack_require__(881);
      module.exports = __webpack_exports__;
    })();
  }
});

// node_modules/@foxglove/cdr/dist/EncapsulationKind.js
var require_EncapsulationKind = __commonJS({
  "node_modules/@foxglove/cdr/dist/EncapsulationKind.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.EncapsulationKind = void 0;
    var EncapsulationKind;
    (function(EncapsulationKind2) {
      EncapsulationKind2[EncapsulationKind2["CDR_BE"] = 0] = "CDR_BE";
      EncapsulationKind2[EncapsulationKind2["CDR_LE"] = 1] = "CDR_LE";
      EncapsulationKind2[EncapsulationKind2["PL_CDR_BE"] = 2] = "PL_CDR_BE";
      EncapsulationKind2[EncapsulationKind2["PL_CDR_LE"] = 3] = "PL_CDR_LE";
      EncapsulationKind2[EncapsulationKind2["CDR2_BE"] = 16] = "CDR2_BE";
      EncapsulationKind2[EncapsulationKind2["CDR2_LE"] = 17] = "CDR2_LE";
      EncapsulationKind2[EncapsulationKind2["PL_CDR2_BE"] = 18] = "PL_CDR2_BE";
      EncapsulationKind2[EncapsulationKind2["PL_CDR2_LE"] = 19] = "PL_CDR2_LE";
      EncapsulationKind2[EncapsulationKind2["DELIMITED_CDR2_BE"] = 20] = "DELIMITED_CDR2_BE";
      EncapsulationKind2[EncapsulationKind2["DELIMITED_CDR2_LE"] = 21] = "DELIMITED_CDR2_LE";
      EncapsulationKind2[EncapsulationKind2["RTPS_CDR2_BE"] = 6] = "RTPS_CDR2_BE";
      EncapsulationKind2[EncapsulationKind2["RTPS_CDR2_LE"] = 7] = "RTPS_CDR2_LE";
      EncapsulationKind2[EncapsulationKind2["RTPS_DELIMITED_CDR2_BE"] = 8] = "RTPS_DELIMITED_CDR2_BE";
      EncapsulationKind2[EncapsulationKind2["RTPS_DELIMITED_CDR2_LE"] = 9] = "RTPS_DELIMITED_CDR2_LE";
      EncapsulationKind2[EncapsulationKind2["RTPS_PL_CDR2_BE"] = 10] = "RTPS_PL_CDR2_BE";
      EncapsulationKind2[EncapsulationKind2["RTPS_PL_CDR2_LE"] = 11] = "RTPS_PL_CDR2_LE";
    })(EncapsulationKind = exports.EncapsulationKind || (exports.EncapsulationKind = {}));
  }
});

// node_modules/@foxglove/cdr/dist/getEncapsulationKindInfo.js
var require_getEncapsulationKindInfo = __commonJS({
  "node_modules/@foxglove/cdr/dist/getEncapsulationKindInfo.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getEncapsulationKindInfo = void 0;
    var EncapsulationKind_1 = require_EncapsulationKind();
    var getEncapsulationKindInfo = (kind) => {
      const isCDR2 = kind > EncapsulationKind_1.EncapsulationKind.PL_CDR_LE;
      const littleEndian = kind === EncapsulationKind_1.EncapsulationKind.CDR_LE || kind === EncapsulationKind_1.EncapsulationKind.PL_CDR_LE || kind === EncapsulationKind_1.EncapsulationKind.CDR2_LE || kind === EncapsulationKind_1.EncapsulationKind.PL_CDR2_LE || kind === EncapsulationKind_1.EncapsulationKind.DELIMITED_CDR2_LE || kind === EncapsulationKind_1.EncapsulationKind.RTPS_CDR2_LE || kind === EncapsulationKind_1.EncapsulationKind.RTPS_PL_CDR2_LE || kind === EncapsulationKind_1.EncapsulationKind.RTPS_DELIMITED_CDR2_LE;
      const isDelimitedCDR2 = kind === EncapsulationKind_1.EncapsulationKind.DELIMITED_CDR2_BE || kind === EncapsulationKind_1.EncapsulationKind.DELIMITED_CDR2_LE || kind === EncapsulationKind_1.EncapsulationKind.RTPS_DELIMITED_CDR2_BE || kind === EncapsulationKind_1.EncapsulationKind.RTPS_DELIMITED_CDR2_LE;
      const isPLCDR2 = kind === EncapsulationKind_1.EncapsulationKind.PL_CDR2_BE || kind === EncapsulationKind_1.EncapsulationKind.PL_CDR2_LE || kind === EncapsulationKind_1.EncapsulationKind.RTPS_PL_CDR2_BE || kind === EncapsulationKind_1.EncapsulationKind.RTPS_PL_CDR2_LE;
      const isPLCDR1 = kind === EncapsulationKind_1.EncapsulationKind.PL_CDR_BE || kind === EncapsulationKind_1.EncapsulationKind.PL_CDR_LE;
      const usesDelimiterHeader = isDelimitedCDR2 || isPLCDR2;
      const usesMemberHeader = isPLCDR2 || isPLCDR1;
      return {
        isCDR2,
        littleEndian,
        usesDelimiterHeader,
        usesMemberHeader
      };
    };
    exports.getEncapsulationKindInfo = getEncapsulationKindInfo;
  }
});

// node_modules/@foxglove/cdr/dist/isBigEndian.js
var require_isBigEndian = __commonJS({
  "node_modules/@foxglove/cdr/dist/isBigEndian.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isBigEndian = void 0;
    var endianTestArray = new Uint8Array(4);
    var endianTestView = new Uint32Array(endianTestArray.buffer);
    endianTestView[0] = 1;
    function isBigEndian() {
      return endianTestArray[3] === 1;
    }
    exports.isBigEndian = isBigEndian;
  }
});

// node_modules/@foxglove/cdr/dist/lengthCodes.js
var require_lengthCodes = __commonJS({
  "node_modules/@foxglove/cdr/dist/lengthCodes.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.lengthCodeToObjectSizes = exports.getLengthCodeForObjectSize = void 0;
    function getLengthCodeForObjectSize(objectSize) {
      let defaultLengthCode;
      switch (objectSize) {
        case 1:
          defaultLengthCode = 0;
          break;
        case 2:
          defaultLengthCode = 1;
          break;
        case 4:
          defaultLengthCode = 2;
          break;
        case 8:
          defaultLengthCode = 3;
          break;
      }
      if (defaultLengthCode == void 0) {
        if (objectSize > 4294967295) {
          throw Error(`Object size ${objectSize} for EMHEADER too large without specifying length code. Max size is ${4294967295}`);
        }
        defaultLengthCode = 4;
      }
      return defaultLengthCode;
    }
    exports.getLengthCodeForObjectSize = getLengthCodeForObjectSize;
    exports.lengthCodeToObjectSizes = {
      0: 1,
      1: 2,
      2: 4,
      3: 8
    };
  }
});

// node_modules/@foxglove/cdr/dist/reservedPIDs.js
var require_reservedPIDs = __commonJS({
  "node_modules/@foxglove/cdr/dist/reservedPIDs.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SENTINEL_PID = exports.EXTENDED_PID = void 0;
    exports.EXTENDED_PID = 16129;
    exports.SENTINEL_PID = 16130;
  }
});

// node_modules/@foxglove/cdr/dist/CdrReader.js
var require_CdrReader = __commonJS({
  "node_modules/@foxglove/cdr/dist/CdrReader.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CdrReader = void 0;
    var getEncapsulationKindInfo_1 = require_getEncapsulationKindInfo();
    var isBigEndian_1 = require_isBigEndian();
    var lengthCodes_1 = require_lengthCodes();
    var reservedPIDs_1 = require_reservedPIDs();
    var textDecoder2 = new TextDecoder("utf8");
    var CdrReader = class _CdrReader {
      constructor(data) {
        this.origin = 0;
        if (data.byteLength < 4) {
          throw new Error(`Invalid CDR data size ${data.byteLength}, must contain at least a 4-byte header`);
        }
        this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const kind = this.kind;
        const { isCDR2, littleEndian, usesDelimiterHeader, usesMemberHeader } = (0, getEncapsulationKindInfo_1.getEncapsulationKindInfo)(kind);
        this.usesDelimiterHeader = usesDelimiterHeader;
        this.usesMemberHeader = usesMemberHeader;
        this.littleEndian = littleEndian;
        this.hostLittleEndian = !(0, isBigEndian_1.isBigEndian)();
        this.isCDR2 = isCDR2;
        this.eightByteAlignment = isCDR2 ? 4 : 8;
        this.origin = 4;
        this.offset = 4;
      }
      get kind() {
        return this.view.getUint8(1);
      }
      get decodedBytes() {
        return this.offset;
      }
      get byteLength() {
        return this.view.byteLength;
      }
      int8() {
        const value = this.view.getInt8(this.offset);
        this.offset += 1;
        return value;
      }
      uint8() {
        const value = this.view.getUint8(this.offset);
        this.offset += 1;
        return value;
      }
      int16() {
        this.align(2);
        const value = this.view.getInt16(this.offset, this.littleEndian);
        this.offset += 2;
        return value;
      }
      uint16() {
        this.align(2);
        const value = this.view.getUint16(this.offset, this.littleEndian);
        this.offset += 2;
        return value;
      }
      int32() {
        this.align(4);
        const value = this.view.getInt32(this.offset, this.littleEndian);
        this.offset += 4;
        return value;
      }
      uint32() {
        this.align(4);
        const value = this.view.getUint32(this.offset, this.littleEndian);
        this.offset += 4;
        return value;
      }
      int64() {
        this.align(this.eightByteAlignment);
        const value = this.view.getBigInt64(this.offset, this.littleEndian);
        this.offset += 8;
        return value;
      }
      uint64() {
        this.align(this.eightByteAlignment);
        const value = this.view.getBigUint64(this.offset, this.littleEndian);
        this.offset += 8;
        return value;
      }
      uint16BE() {
        this.align(2);
        const value = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return value;
      }
      uint32BE() {
        this.align(4);
        const value = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return value;
      }
      uint64BE() {
        this.align(this.eightByteAlignment);
        const value = this.view.getBigUint64(this.offset, false);
        this.offset += 8;
        return value;
      }
      float32() {
        this.align(4);
        const value = this.view.getFloat32(this.offset, this.littleEndian);
        this.offset += 4;
        return value;
      }
      float64() {
        this.align(this.eightByteAlignment);
        const value = this.view.getFloat64(this.offset, this.littleEndian);
        this.offset += 8;
        return value;
      }
      string(prereadLength) {
        const length = prereadLength ?? this.uint32();
        if (length <= 1) {
          this.offset += length;
          return "";
        }
        const data = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length - 1);
        const value = textDecoder2.decode(data);
        this.offset += length;
        return value;
      }
      /** Reads the delimiter header which contains and returns the object size */
      dHeader() {
        const header = this.uint32();
        return header;
      }
      /**
       * Reads the member header (EMHEADER) and returns the member ID, mustUnderstand flag, and object size with optional length code
       * The length code is only present in CDR2 and should prompt objectSize to be used in place of sequence length if applicable.
       * See Extensible and Dynamic Topic Types (DDS-XTypes) v1.3 @ `7.4.3.4.2` for more info about CDR2 EMHEADER composition.
       * If a sentinelHeader was read (PL_CDR v1), the readSentinelHeader flag is set to true.
       */
      emHeader() {
        if (this.isCDR2) {
          return this.memberHeaderV2();
        } else {
          return this.memberHeaderV1();
        }
      }
      /** XCDR1 PL_CDR encapsulation parameter header*/
      memberHeaderV1() {
        this.align(4);
        const idHeader = this.uint16();
        const mustUnderstandFlag = (idHeader & 16384) >> 14 === 1;
        const implementationSpecificFlag = (idHeader & 32768) >> 15 === 1;
        const extendedPIDFlag = (idHeader & 16383) === reservedPIDs_1.EXTENDED_PID;
        const sentinelPIDFlag = (idHeader & 16383) === reservedPIDs_1.SENTINEL_PID;
        if (sentinelPIDFlag) {
          this.uint16();
          return { id: reservedPIDs_1.SENTINEL_PID, objectSize: 0, mustUnderstand: false, readSentinelHeader: true };
        }
        const usesReservedParameterId = (idHeader & 16383) > reservedPIDs_1.SENTINEL_PID;
        if (usesReservedParameterId || implementationSpecificFlag) {
          throw new Error(`Unsupported parameter ID header ${idHeader.toString(16)}`);
        }
        if (extendedPIDFlag) {
          this.uint16();
        }
        const id = extendedPIDFlag ? this.uint32() : idHeader & 16383;
        const objectSize = extendedPIDFlag ? this.uint32() : this.uint16();
        this.resetOrigin();
        return { id, objectSize, mustUnderstand: mustUnderstandFlag };
      }
      /** Sets the origin to the offset (DDS-XTypes Spec: `PUSH(ORIGIN = 0)`)*/
      resetOrigin() {
        this.origin = this.offset;
      }
      /** Reads boolean flag for optional members in CDR2
       * Will throw an error if called for CDR1.
       */
      isPresentFlag() {
        if (!this.isCDR2) {
          throw new Error("isPresentFlag is only supported for CDR2");
        }
        const isPresent = Boolean(this.uint8());
        return isPresent;
      }
      /** Reads the PID_SENTINEL value if encapsulation kind supports it (PL_CDR version 1)
       * @returns true if the sentinel header was read, false otherwise
       */
      sentinelHeader() {
        if (!this.isCDR2) {
          this.align(4);
          const header = this.uint16();
          const sentinelPIDFlag = (header & 16383) === reservedPIDs_1.SENTINEL_PID;
          if (!sentinelPIDFlag) {
            return false;
          }
          this.uint16();
          return true;
        } else {
          return false;
        }
      }
      memberHeaderV2() {
        const header = this.uint32();
        const mustUnderstand = Math.abs((header & 2147483648) >> 31) === 1;
        const lengthCode = (header & 1879048192) >> 28;
        const id = header & 268435455;
        const objectSize = this.emHeaderObjectSize(lengthCode);
        return { mustUnderstand, id, objectSize, lengthCode };
      }
      /** Uses the length code to derive the member object size in
       * the EMHEADER, sometimes reading NEXTINT (the next uint32
       * following the header) from the buffer */
      emHeaderObjectSize(lengthCode) {
        switch (lengthCode) {
          case 0:
          case 1:
          case 2:
          case 3:
            return lengthCodes_1.lengthCodeToObjectSizes[lengthCode];
          // LC > 3 -> NEXTINT exists after header
          case 4:
          case 5:
            return this.uint32();
          case 6:
            return 4 * this.uint32();
          case 7:
            return 8 * this.uint32();
          default:
            throw new Error(
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `Invalid length code ${lengthCode} in EMHEADER at offset ${this.offset - 4}`
            );
        }
      }
      sequenceLength() {
        return this.uint32();
      }
      int8Array(count = this.sequenceLength()) {
        const array = new Int8Array(this.view.buffer, this.view.byteOffset + this.offset, count);
        this.offset += count;
        return array;
      }
      uint8Array(count = this.sequenceLength()) {
        const array = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, count);
        this.offset += count;
        return array;
      }
      int16Array(count = this.sequenceLength()) {
        return this.typedArray(Int16Array, "getInt16", count);
      }
      uint16Array(count = this.sequenceLength()) {
        return this.typedArray(Uint16Array, "getUint16", count);
      }
      int32Array(count = this.sequenceLength()) {
        return this.typedArray(Int32Array, "getInt32", count);
      }
      uint32Array(count = this.sequenceLength()) {
        return this.typedArray(Uint32Array, "getUint32", count);
      }
      int64Array(count = this.sequenceLength()) {
        return this.typedArray(BigInt64Array, "getBigInt64", count, this.eightByteAlignment);
      }
      uint64Array(count = this.sequenceLength()) {
        return this.typedArray(BigUint64Array, "getBigUint64", count, this.eightByteAlignment);
      }
      float32Array(count = this.sequenceLength()) {
        return this.typedArray(Float32Array, "getFloat32", count);
      }
      float64Array(count = this.sequenceLength()) {
        return this.typedArray(Float64Array, "getFloat64", count, this.eightByteAlignment);
      }
      stringArray(count = this.sequenceLength()) {
        const output = [];
        for (let i = 0; i < count; i++) {
          output.push(this.string());
        }
        return output;
      }
      /**
       * Seek the current read pointer a number of bytes relative to the current position. Note that
       * seeking before the four-byte header is invalid
       * @param relativeOffset A positive or negative number of bytes to seek
       */
      seek(relativeOffset) {
        const newOffset = this.offset + relativeOffset;
        if (newOffset < 4 || newOffset > this.view.byteLength) {
          throw new Error(`seek(${relativeOffset}) failed, ${newOffset} is outside the data range`);
        }
        this.offset = newOffset;
      }
      /**
       * Seek to an absolute byte position in the data. Note that seeking before the four-byte header is
       * invalid
       * @param offset An absolute byte offset in the range of [4-byteLength)
       */
      seekTo(offset) {
        if (offset < 4 || offset > this.view.byteLength) {
          throw new Error(`seekTo(${offset}) failed, value is outside the data range`);
        }
        this.offset = offset;
      }
      /**
       * Duplicate this reader. The underlying buffer is reused and not copied.
       */
      clone() {
        const clone = new _CdrReader(this.view);
        clone.offset = this.offset;
        clone.origin = this.origin;
        return clone;
      }
      /**
       * Limit the reader to a given number of bytes.
       * @param length The number of bytes to limit the reader to.
       */
      limit(length) {
        const newByteLength = this.offset + length;
        if (newByteLength <= this.view.byteLength) {
          this.view = new DataView(this.view.buffer, this.view.byteOffset, newByteLength);
        } else {
          throw new RangeError(`length ${length} exceeds byte length of view`);
        }
      }
      /**
       * Returns `true` if the reader is at the end of the buffer, or `false` otherwise.
       */
      isAtEnd() {
        return this.offset >= this.view.byteLength;
      }
      align(size) {
        const alignment = (this.offset - this.origin) % size;
        if (alignment > 0) {
          this.offset += size - alignment;
        }
      }
      // Reads a given count of numeric values into a typed array.
      typedArray(TypedArrayConstructor, getter, count, alignment = TypedArrayConstructor.BYTES_PER_ELEMENT) {
        if (count === 0) {
          return new TypedArrayConstructor();
        }
        this.align(alignment);
        const totalOffset = this.view.byteOffset + this.offset;
        if (this.littleEndian !== this.hostLittleEndian) {
          return this.typedArraySlow(TypedArrayConstructor, getter, count);
        } else if (totalOffset % TypedArrayConstructor.BYTES_PER_ELEMENT === 0) {
          const array = new TypedArrayConstructor(this.view.buffer, totalOffset, count);
          this.offset += TypedArrayConstructor.BYTES_PER_ELEMENT * count;
          return array;
        } else {
          return this.typedArrayUnaligned(TypedArrayConstructor, getter, count);
        }
      }
      typedArrayUnaligned(TypedArrayConstructor, getter, count) {
        if (count < 10) {
          return this.typedArraySlow(TypedArrayConstructor, getter, count);
        }
        const byteLength = TypedArrayConstructor.BYTES_PER_ELEMENT * count;
        const copy = new Uint8Array(byteLength);
        copy.set(new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, byteLength));
        this.offset += byteLength;
        return new TypedArrayConstructor(copy.buffer, copy.byteOffset, count);
      }
      typedArraySlow(TypedArrayConstructor, getter, count) {
        const array = new TypedArrayConstructor(count);
        let offset = this.offset;
        for (let i = 0; i < count; i++) {
          array[i] = this.view[getter](offset, this.littleEndian);
          offset += TypedArrayConstructor.BYTES_PER_ELEMENT;
        }
        this.offset = offset;
        return array;
      }
    };
    exports.CdrReader = CdrReader;
  }
});

// node_modules/@foxglove/cdr/dist/CdrSizeCalculator.js
var require_CdrSizeCalculator = __commonJS({
  "node_modules/@foxglove/cdr/dist/CdrSizeCalculator.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CdrSizeCalculator = void 0;
    var CdrSizeCalculator = class {
      constructor() {
        this.offset = 4;
      }
      get size() {
        return this.offset;
      }
      int8() {
        return this.incrementAndReturn(1);
      }
      uint8() {
        return this.incrementAndReturn(1);
      }
      int16() {
        return this.incrementAndReturn(2);
      }
      uint16() {
        return this.incrementAndReturn(2);
      }
      int32() {
        return this.incrementAndReturn(4);
      }
      uint32() {
        return this.incrementAndReturn(4);
      }
      int64() {
        return this.incrementAndReturn(8);
      }
      uint64() {
        return this.incrementAndReturn(8);
      }
      float32() {
        return this.incrementAndReturn(4);
      }
      float64() {
        return this.incrementAndReturn(8);
      }
      string(length) {
        this.uint32();
        this.offset += length + 1;
        return this.offset;
      }
      sequenceLength() {
        return this.uint32();
      }
      // Increments the offset by `byteCount` and any required padding bytes and
      // returns the new offset
      incrementAndReturn(byteCount) {
        const alignment = (this.offset - 4) % byteCount;
        if (alignment > 0) {
          this.offset += byteCount - alignment;
        }
        this.offset += byteCount;
        return this.offset;
      }
    };
    exports.CdrSizeCalculator = CdrSizeCalculator;
  }
});

// node_modules/@foxglove/cdr/dist/CdrWriter.js
var require_CdrWriter = __commonJS({
  "node_modules/@foxglove/cdr/dist/CdrWriter.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CdrWriter = void 0;
    var EncapsulationKind_1 = require_EncapsulationKind();
    var getEncapsulationKindInfo_1 = require_getEncapsulationKindInfo();
    var isBigEndian_1 = require_isBigEndian();
    var lengthCodes_1 = require_lengthCodes();
    var reservedPIDs_1 = require_reservedPIDs();
    var textEncoder = new TextEncoder();
    var CdrWriter = class _CdrWriter {
      constructor(options = {}) {
        if (options.buffer != void 0) {
          this.buffer = options.buffer;
        } else if (options.size != void 0) {
          this.buffer = new ArrayBuffer(options.size);
        } else {
          this.buffer = new ArrayBuffer(_CdrWriter.DEFAULT_CAPACITY);
        }
        const kind = options.kind ?? EncapsulationKind_1.EncapsulationKind.CDR_LE;
        const { isCDR2, littleEndian } = (0, getEncapsulationKindInfo_1.getEncapsulationKindInfo)(kind);
        this.isCDR2 = isCDR2;
        this.littleEndian = littleEndian;
        this.hostLittleEndian = !(0, isBigEndian_1.isBigEndian)();
        this.eightByteAlignment = isCDR2 ? 4 : 8;
        this.array = new Uint8Array(this.buffer);
        this.view = new DataView(this.buffer);
        this.resizeIfNeeded(4);
        this.view.setUint8(0, 0);
        this.view.setUint8(1, kind);
        this.view.setUint16(2, 0, false);
        this.offset = 4;
        this.origin = 4;
      }
      get data() {
        return new Uint8Array(this.buffer, 0, this.offset);
      }
      get size() {
        return this.offset;
      }
      get kind() {
        return this.view.getUint8(1);
      }
      int8(value) {
        this.resizeIfNeeded(1);
        this.view.setInt8(this.offset, value);
        this.offset += 1;
        return this;
      }
      uint8(value) {
        this.resizeIfNeeded(1);
        this.view.setUint8(this.offset, value);
        this.offset += 1;
        return this;
      }
      int16(value) {
        this.align(2);
        this.view.setInt16(this.offset, value, this.littleEndian);
        this.offset += 2;
        return this;
      }
      uint16(value) {
        this.align(2);
        this.view.setUint16(this.offset, value, this.littleEndian);
        this.offset += 2;
        return this;
      }
      int32(value) {
        this.align(4);
        this.view.setInt32(this.offset, value, this.littleEndian);
        this.offset += 4;
        return this;
      }
      uint32(value) {
        this.align(4);
        this.view.setUint32(this.offset, value, this.littleEndian);
        this.offset += 4;
        return this;
      }
      int64(value) {
        this.align(this.eightByteAlignment, 8);
        this.view.setBigInt64(this.offset, value, this.littleEndian);
        this.offset += 8;
        return this;
      }
      uint64(value) {
        this.align(this.eightByteAlignment, 8);
        this.view.setBigUint64(this.offset, value, this.littleEndian);
        this.offset += 8;
        return this;
      }
      uint16BE(value) {
        this.align(2);
        this.view.setUint16(this.offset, value, false);
        this.offset += 2;
        return this;
      }
      uint32BE(value) {
        this.align(4);
        this.view.setUint32(this.offset, value, false);
        this.offset += 4;
        return this;
      }
      uint64BE(value) {
        this.align(this.eightByteAlignment, 8);
        this.view.setBigUint64(this.offset, value, false);
        this.offset += 8;
        return this;
      }
      float32(value) {
        this.align(4);
        this.view.setFloat32(this.offset, value, this.littleEndian);
        this.offset += 4;
        return this;
      }
      float64(value) {
        this.align(this.eightByteAlignment, 8);
        this.view.setFloat64(this.offset, value, this.littleEndian);
        this.offset += 8;
        return this;
      }
      // writeLength optional because it could already be included in a header
      string(value, writeLength = true) {
        const strlen = value.length;
        if (writeLength) {
          this.uint32(strlen + 1);
        }
        this.resizeIfNeeded(strlen + 1);
        textEncoder.encodeInto(value, new Uint8Array(this.buffer, this.offset, strlen));
        this.view.setUint8(this.offset + strlen, 0);
        this.offset += strlen + 1;
        return this;
      }
      /** Writes the delimiter header using object size
       * NOTE: changing endian-ness with a single CDR message is not supported
       */
      dHeader(objectSize) {
        const header = objectSize;
        this.uint32(header);
        return this;
      }
      /**
       * Writes the member header (EMHEADER)
       * Accomodates for PL_CDR and PL_CDR2 based on the CdrWriter constructor options
       *
       * @param mustUnderstand - Whether the member is required to be understood by the receiver
       * @param id - The member ID
       * @param objectSize - The size of the member in bytes
       * @param lengthCode - Optional length code for CDR2 emHeaders.
       * lengthCode values [5-7] allow the emHeader object size to take the place of the normally encoded member length.
       *
       * NOTE: Dynamically determines default value if not provided that does not affect serialization ie will use lengthCode values [0-4].
       *
       * From Extensible and Dynamic Topic Types in DDS-XTypes v1.3 @ `7.4.3.4.2`:
       * "EMHEADER1 with LC values 5 to 7 also affect the serialization/deserialization virtual machine in that they cause NEXTINT to be
       * reused also as part of the serialized member. This is useful because the serialization of certain members also starts with an
       * integer length, which would take exactly the same value as NEXTINT. Therefore the use of length codes 5 to 7 saves 4 bytes in
       * the serialization."
       * @returns - CdrWriter instance
       */
      emHeader(mustUnderstand, id, objectSize, lengthCode) {
        return this.isCDR2 ? this.memberHeaderV2(mustUnderstand, id, objectSize, lengthCode) : this.memberHeaderV1(mustUnderstand, id, objectSize);
      }
      memberHeaderV1(mustUnderstand, id, objectSize) {
        this.align(4);
        const mustUnderstandFlag = mustUnderstand ? 1 << 14 : 0;
        const shouldUseExtendedPID = id > 16128 || objectSize > 65535;
        if (!shouldUseExtendedPID) {
          const idHeader = mustUnderstandFlag | id;
          this.uint16(idHeader);
          const objectSizeHeader = objectSize & 65535;
          this.uint16(objectSizeHeader);
        } else {
          const extendedHeader = mustUnderstandFlag | reservedPIDs_1.EXTENDED_PID;
          this.uint16(extendedHeader);
          this.uint16(8);
          this.uint32(id);
          this.uint32(objectSize);
        }
        this.resetOrigin();
        return this;
      }
      /** Sets the origin to the offset (DDS-XTypes Spec: `PUSH(ORIGIN = 0)`)*/
      resetOrigin() {
        this.origin = this.offset;
      }
      /** Writes boolean flag for optional members in CDR2
       * @throws Error if called for CDR1.
       */
      presentFlag(value) {
        if (!this.isCDR2) {
          throw new Error("presentFlag is only supported for CDR2");
        }
        this.uint8(value ? 1 : 0);
        return this;
      }
      /** Writes the PID_SENTINEL value if encapsulation supports it*/
      sentinelHeader() {
        if (!this.isCDR2) {
          this.align(4);
          this.uint16(reservedPIDs_1.SENTINEL_PID);
          this.uint16(0);
        }
        return this;
      }
      memberHeaderV2(mustUnderstand, id, objectSize, lengthCode) {
        if (id > 268435455) {
          throw Error(`Member ID ${id} is too large. Max value is ${268435455}`);
        }
        const mustUnderstandFlag = mustUnderstand ? 1 << 31 : 0;
        const finalLengthCode = lengthCode ?? (0, lengthCodes_1.getLengthCodeForObjectSize)(objectSize);
        const header = mustUnderstandFlag | finalLengthCode << 28 | id;
        this.uint32(header);
        switch (finalLengthCode) {
          case 0:
          case 1:
          case 2:
          case 3: {
            const shouldBeSize = lengthCodes_1.lengthCodeToObjectSizes[finalLengthCode];
            if (objectSize !== shouldBeSize) {
              throw new Error(`Cannot write a length code ${finalLengthCode} header with an object size not equal to ${shouldBeSize}`);
            }
            break;
          }
          // When the length code is > 3 the header is 8 bytes because of the NEXTINT value storing the object size
          case 4:
          case 5:
            this.uint32(objectSize);
            break;
          case 6:
            if (objectSize % 4 !== 0) {
              throw new Error("Cannot write a length code 6 header with an object size that is not a multiple of 4");
            }
            this.uint32(objectSize >> 2);
            break;
          case 7:
            if (objectSize % 8 !== 0) {
              throw new Error("Cannot write a length code 7 header with an object size that is not a multiple of 8");
            }
            this.uint32(objectSize >> 3);
            break;
          default:
            throw new Error(`Unexpected length code ${finalLengthCode}`);
        }
        return this;
      }
      sequenceLength(value) {
        return this.uint32(value);
      }
      int8Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        this.resizeIfNeeded(value.length);
        this.array.set(value, this.offset);
        this.offset += value.length;
        return this;
      }
      uint8Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        this.resizeIfNeeded(value.length);
        this.array.set(value, this.offset);
        this.offset += value.length;
        return this;
      }
      int16Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof Int16Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.int16(entry);
          }
        }
        return this;
      }
      uint16Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof Uint16Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.uint16(entry);
          }
        }
        return this;
      }
      int32Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof Int32Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.int32(entry);
          }
        }
        return this;
      }
      uint32Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof Uint32Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.uint32(entry);
          }
        }
        return this;
      }
      int64Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof BigInt64Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.int64(BigInt(entry));
          }
        }
        return this;
      }
      uint64Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof BigUint64Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.uint64(BigInt(entry));
          }
        }
        return this;
      }
      float32Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof Float32Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.float32(entry);
          }
        }
        return this;
      }
      float64Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof Float64Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.float64(entry);
          }
        }
        return this;
      }
      /**
       * Calculate the capacity needed to hold the given number of aligned bytes,
       * resize if needed, and write padding bytes for alignment
       * @param size Byte width to align to. If the current offset is 1 and `size`
       *   is 4, 3 bytes of padding will be written
       * @param bytesToWrite Optional, total amount of bytes that are intended to be
       *   written directly following the alignment. This can be used to avoid
       *   additional buffer resizes in the case of writing large blocks of aligned
       *   data such as arrays
       */
      align(size, bytesToWrite = size) {
        const alignment = (this.offset - this.origin) % size;
        const padding = alignment > 0 ? size - alignment : 0;
        this.resizeIfNeeded(padding + bytesToWrite);
        this.array.fill(0, this.offset, this.offset + padding);
        this.offset += padding;
      }
      resizeIfNeeded(additionalBytes) {
        const capacity = this.offset + additionalBytes;
        if (this.buffer.byteLength < capacity) {
          const doubled = this.buffer.byteLength * 2;
          const newCapacity = doubled > capacity ? doubled : capacity;
          this.resize(newCapacity);
        }
      }
      resize(capacity) {
        if (this.buffer.byteLength >= capacity) {
          return;
        }
        const buffer = new ArrayBuffer(capacity);
        const array = new Uint8Array(buffer);
        array.set(this.array);
        this.buffer = buffer;
        this.array = array;
        this.view = new DataView(buffer);
      }
    };
    exports.CdrWriter = CdrWriter;
    CdrWriter.DEFAULT_CAPACITY = 16;
    CdrWriter.BUFFER_COPY_THRESHOLD = 10;
  }
});

// node_modules/@foxglove/cdr/dist/index.js
var require_dist2 = __commonJS({
  "node_modules/@foxglove/cdr/dist/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      Object.defineProperty(o, k2, { enumerable: true, get: function() {
        return m[k];
      } });
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(require_CdrReader(), exports);
    __exportStar(require_CdrSizeCalculator(), exports);
    __exportStar(require_CdrWriter(), exports);
    __exportStar(require_EncapsulationKind(), exports);
  }
});

// node_modules/@foxglove/omgidl-serialization/dist/constants.js
var require_constants = __commonJS({
  "node_modules/@foxglove/omgidl-serialization/dist/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.UNION_DISCRIMINATOR_PROPERTY_KEY = void 0;
    exports.UNION_DISCRIMINATOR_PROPERTY_KEY = "$discriminator";
  }
});

// node_modules/@foxglove/omgidl-serialization/dist/defaultValues.js
var require_defaultValues = __commonJS({
  "node_modules/@foxglove/omgidl-serialization/dist/defaultValues.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DEFAULT_BYTE_VALUE = exports.DEFAULT_NUMERICAL_VALUE = exports.DEFAULT_STRING_VALUE = exports.DEFAULT_BOOLEAN_VALUE = void 0;
    exports.DEFAULT_BOOLEAN_VALUE = false;
    exports.DEFAULT_STRING_VALUE = "";
    exports.DEFAULT_NUMERICAL_VALUE = 0;
    exports.DEFAULT_BYTE_VALUE = 0;
  }
});

// node_modules/@foxglove/omgidl-serialization/dist/DeserializationInfoCache.js
var require_DeserializationInfoCache = __commonJS({
  "node_modules/@foxglove/omgidl-serialization/dist/DeserializationInfoCache.js"(exports) {
    "use strict";
    var __classPrivateFieldSet = exports && exports.__classPrivateFieldSet || function(receiver, state, value, kind, f) {
      if (kind === "m") throw new TypeError("Private method is not writable");
      if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
      if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
      return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
    };
    var __classPrivateFieldGet = exports && exports.__classPrivateFieldGet || function(receiver, state, kind, f) {
      if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
      if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
      return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
    };
    var _DeserializationInfoCache_instances;
    var _DeserializationInfoCache_definitions;
    var _DeserializationInfoCache_complexDeserializationInfo;
    var _DeserializationInfoCache_getComplexDeserInfoDefault;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PRIMITIVE_DEFAULT_VALUE_GETTERS = exports.PRIMITIVE_ARRAY_DESERIALIZERS = exports.PRIMITIVE_DESERIALIZERS = exports.DeserializationInfoCache = void 0;
    exports.makeNestedArray = makeNestedArray;
    var constants_1 = require_constants();
    var defaultValues_1 = require_defaultValues();
    var DeserializationInfoCache = class {
      constructor(definitions) {
        _DeserializationInfoCache_instances.add(this);
        _DeserializationInfoCache_definitions.set(this, void 0);
        _DeserializationInfoCache_complexDeserializationInfo.set(this, /* @__PURE__ */ new Map());
        __classPrivateFieldSet(this, _DeserializationInfoCache_definitions, new Map(definitions.map((def) => [def.name ?? "", def])), "f");
      }
      /**
       * Gets the deserialization info object for a complex definition (struct or union).
       * If not found in the cache, the deserialization info object will be built (including sub-types)
       * and added to the cache.
       *
       * @param definition Message definition
       * @returns Deserialization info
       */
      getComplexDeserializationInfo(definition) {
        if (definition.aggregatedKind === "module") {
          throw new Error(`Modules are not used in serialization`);
        }
        const cached = __classPrivateFieldGet(this, _DeserializationInfoCache_complexDeserializationInfo, "f").get(definition.name ?? "");
        if (cached) {
          return cached;
        }
        if (definition.aggregatedKind === "union") {
          const switchTypeDeser = exports.PRIMITIVE_DESERIALIZERS.get(definition.switchType);
          const switchTypeLength = typeToByteLength(definition.switchType);
          if (switchTypeDeser == void 0 || switchTypeLength == void 0) {
            throw new Error(`Unrecognized primitive type ${definition.switchType} in union ${definition.name ?? "unknown"}`);
          }
          const deserInfo2 = {
            type: "union",
            ...getHeaderNeeds(definition),
            definition,
            switchTypeDeser,
            switchTypeLength
          };
          __classPrivateFieldGet(this, _DeserializationInfoCache_complexDeserializationInfo, "f").set(definition.name ?? "", deserInfo2);
          return deserInfo2;
        }
        const fieldsInOrder = [];
        for (const field of definition.definitions) {
          if (field.isConstant === true) {
            continue;
          }
          fieldsInOrder.push(this.buildFieldDeserInfo(field));
        }
        const autoidAnnotation = definition.annotations?.["autoid"];
        if (autoidAnnotation != void 0) {
          throw new Error(`@autoid annotations are not supported. If you are using @autoid(SEQUENTIAL) then remove the annotation. @autoid(HASH) is not supported.`);
        }
        let nextSequentialId = 0;
        const fieldIndexById = /* @__PURE__ */ new Map();
        for (let idx = 0; idx < fieldsInOrder.length; idx++) {
          const field = fieldsInOrder[idx];
          const id = field.definitionId ?? nextSequentialId;
          const existingFieldIdx = fieldIndexById.get(id);
          if (existingFieldIdx != void 0) {
            throw new Error(`struct ${definition.name ?? "(unnamed)"} has multiple fields with id ${id}: ${fieldsInOrder[existingFieldIdx].name} and ${field.name}`);
          }
          fieldIndexById.set(id, idx);
          nextSequentialId = id + 1;
        }
        const deserInfo = {
          type: "struct",
          ...getHeaderNeeds(definition),
          definition,
          fieldIndexById,
          fieldsInOrder
        };
        __classPrivateFieldGet(this, _DeserializationInfoCache_complexDeserializationInfo, "f").set(definition.name ?? "", deserInfo);
        return deserInfo;
      }
      /**
       * Builds the deserialization info object for a field definition which can be a complex or primitive type.
       *
       * @param definition Field definition
       * @returns Deserialization info
       */
      buildFieldDeserInfo(definition) {
        const { name, type, isComplex, isArray, arrayLengths } = definition;
        if (isComplex === true) {
          let typeDeserInfo = __classPrivateFieldGet(this, _DeserializationInfoCache_complexDeserializationInfo, "f").get(type);
          if (!typeDeserInfo) {
            const fieldDefinition = __classPrivateFieldGet(this, _DeserializationInfoCache_definitions, "f").get(type);
            if (!fieldDefinition) {
              throw new Error(`Failed to find definition for type ${type}`);
            }
            typeDeserInfo = this.getComplexDeserializationInfo(fieldDefinition);
          }
          return {
            name,
            type,
            typeDeserInfo,
            isArray,
            arrayLengths,
            definitionId: getDefinitionId(definition),
            isOptional: isOptional(definition),
            isComplex: true
          };
        }
        if (type === "wchar" || type === "wstring") {
          throw new Error(`'wchar' and 'wstring' types are not supported because they are implementation dependent`);
        }
        const deserialize = isArray === true ? exports.PRIMITIVE_ARRAY_DESERIALIZERS.get(type) : exports.PRIMITIVE_DESERIALIZERS.get(type);
        if (!deserialize) {
          throw new Error(`Unrecognized primitive type ${type}`);
        }
        const typeLength = typeToByteLength(type);
        if (typeLength == void 0) {
          throw new Error(`Unrecognized primitive type ${type}`);
        }
        const fieldDeserInfo = isArray === true ? {
          type: "array-primitive",
          deserialize,
          typeLength
        } : {
          type: "primitive",
          deserialize,
          typeLength
        };
        return {
          name,
          type,
          typeDeserInfo: fieldDeserInfo,
          isComplex: false,
          isArray,
          arrayLengths,
          definitionId: getDefinitionId(definition),
          isOptional: isOptional(definition),
          defaultValue: definition.defaultValue
        };
      }
      /** Returns default value for given FieldDeserializationInfo.
       * If defaultValue is not defined on FieldDeserializationInfo, it will be calculated and set.
       */
      getFieldDefault(deserInfo) {
        if (deserInfo.defaultValue != void 0) {
          return deserInfo.defaultValue;
        }
        const { isArray, arrayLengths, type, isComplex } = deserInfo;
        if (isArray === true && arrayLengths == void 0) {
          deserInfo.defaultValue = [];
          return deserInfo.defaultValue;
        }
        let defaultValueGetter;
        if (isComplex) {
          defaultValueGetter = () => {
            return __classPrivateFieldGet(this, _DeserializationInfoCache_instances, "m", _DeserializationInfoCache_getComplexDeserInfoDefault).call(this, deserInfo.typeDeserInfo);
          };
        } else {
          defaultValueGetter = exports.PRIMITIVE_DEFAULT_VALUE_GETTERS.get(type);
          if (!defaultValueGetter) {
            throw new Error(`Failed to find default value getter for type ${type}`);
          }
        }
        const needsNestedArray = isArray === true && arrayLengths != void 0;
        deserInfo.defaultValue = needsNestedArray ? makeNestedArray(defaultValueGetter, arrayLengths, 0) : defaultValueGetter();
        return deserInfo.defaultValue;
      }
    };
    exports.DeserializationInfoCache = DeserializationInfoCache;
    _DeserializationInfoCache_definitions = /* @__PURE__ */ new WeakMap(), _DeserializationInfoCache_complexDeserializationInfo = /* @__PURE__ */ new WeakMap(), _DeserializationInfoCache_instances = /* @__PURE__ */ new WeakSet(), _DeserializationInfoCache_getComplexDeserInfoDefault = function _DeserializationInfoCache_getComplexDeserInfoDefault2(deserInfo) {
      if (deserInfo.defaultValue != void 0 && typeof structuredClone !== "undefined") {
        return structuredClone(deserInfo.defaultValue);
      }
      deserInfo.defaultValue = {};
      const defaultMessage = deserInfo.defaultValue;
      if (deserInfo.type === "union") {
        const { definition: unionDef } = deserInfo;
        const { switchType } = unionDef;
        let defaultCase = unionDef.defaultCase;
        if (!defaultCase) {
          const switchTypeDefaultGetter = exports.PRIMITIVE_DEFAULT_VALUE_GETTERS.get(switchType);
          if (switchTypeDefaultGetter == void 0) {
            throw new Error(`Failed to find default value getter for type ${switchType}`);
          }
          const switchValue = switchTypeDefaultGetter();
          defaultCase = unionDef.cases.find((c) => c.predicates.includes(switchValue))?.type;
          defaultMessage[constants_1.UNION_DISCRIMINATOR_PROPERTY_KEY] = switchValue;
          if (!defaultCase) {
            return defaultMessage;
          }
        } else {
          defaultMessage[constants_1.UNION_DISCRIMINATOR_PROPERTY_KEY] = void 0;
        }
        const defaultCaseDeserInfo = this.buildFieldDeserInfo(defaultCase);
        defaultMessage[defaultCaseDeserInfo.name] = this.getFieldDefault(defaultCaseDeserInfo);
      } else if (deserInfo.type === "struct") {
        for (const field of deserInfo.fieldsInOrder) {
          if (!field.isOptional) {
            defaultMessage[field.name] = this.getFieldDefault(field);
          }
        }
      }
      if (defaultMessage == void 0) {
        throw new Error(`Unrecognized complex type ${deserInfo.type}`);
      }
      return defaultMessage;
    };
    function typeToByteLength(type) {
      switch (type) {
        case "bool":
        case "int8":
        case "uint8":
        case "string":
          return 1;
        case "int16":
        case "uint16":
          return 2;
        case "int32":
        case "uint32":
        case "float32":
          return 4;
        case "int64":
        case "uint64":
        case "float64":
          return 8;
        default:
          return void 0;
      }
    }
    exports.PRIMITIVE_DESERIALIZERS = /* @__PURE__ */ new Map([
      ["bool", (reader) => Boolean(reader.int8())],
      ["int8", (reader) => reader.int8()],
      ["uint8", (reader) => reader.uint8()],
      ["int16", (reader) => reader.int16()],
      ["uint16", (reader) => reader.uint16()],
      ["int32", (reader) => reader.int32()],
      ["uint32", (reader) => reader.uint32()],
      ["int64", (reader) => reader.int64()],
      ["uint64", (reader) => reader.uint64()],
      ["float32", (reader) => reader.float32()],
      ["float64", (reader) => reader.float64()],
      ["string", (reader, length) => reader.string(length)]
    ]);
    exports.PRIMITIVE_ARRAY_DESERIALIZERS = /* @__PURE__ */ new Map([
      ["bool", readBoolArray],
      ["int8", (reader, count) => reader.int8Array(count)],
      ["uint8", (reader, count) => reader.uint8Array(count)],
      ["int16", (reader, count) => reader.int16Array(count)],
      ["uint16", (reader, count) => reader.uint16Array(count)],
      ["int32", (reader, count) => reader.int32Array(count)],
      ["uint32", (reader, count) => reader.uint32Array(count)],
      ["int64", (reader, count) => reader.int64Array(count)],
      ["uint64", (reader, count) => reader.uint64Array(count)],
      ["float32", (reader, count) => reader.float32Array(count)],
      ["float64", (reader, count) => reader.float64Array(count)],
      ["string", readStringArray]
    ]);
    exports.PRIMITIVE_DEFAULT_VALUE_GETTERS = /* @__PURE__ */ new Map([
      ["bool", () => defaultValues_1.DEFAULT_BOOLEAN_VALUE],
      ["int8", () => defaultValues_1.DEFAULT_BYTE_VALUE],
      ["uint8", () => defaultValues_1.DEFAULT_BYTE_VALUE],
      ["int16", () => defaultValues_1.DEFAULT_NUMERICAL_VALUE],
      ["uint16", () => defaultValues_1.DEFAULT_NUMERICAL_VALUE],
      ["int32", () => defaultValues_1.DEFAULT_NUMERICAL_VALUE],
      ["uint32", () => defaultValues_1.DEFAULT_NUMERICAL_VALUE],
      ["int64", () => defaultValues_1.DEFAULT_NUMERICAL_VALUE],
      ["uint64", () => defaultValues_1.DEFAULT_NUMERICAL_VALUE],
      ["float32", () => defaultValues_1.DEFAULT_NUMERICAL_VALUE],
      ["float64", () => defaultValues_1.DEFAULT_NUMERICAL_VALUE],
      ["string", () => defaultValues_1.DEFAULT_STRING_VALUE]
    ]);
    function makeNestedArray(getValue, arrayLengths, depth) {
      if (depth > arrayLengths.length - 1 || depth < 0) {
        throw Error(`Invalid depth ${depth} for array of length ${arrayLengths.length}`);
      }
      const array = [];
      for (let i = 0; i < arrayLengths[depth]; i++) {
        if (depth === arrayLengths.length - 1) {
          array.push(getValue());
        } else {
          array.push(makeNestedArray(getValue, arrayLengths, depth + 1));
        }
      }
      return array;
    }
    function readBoolArray(reader, count) {
      const array = new Array(count);
      for (let i = 0; i < count; i++) {
        array[i] = Boolean(reader.int8());
      }
      return array;
    }
    function readStringArray(reader, count) {
      const array = new Array(count);
      for (let i = 0; i < count; i++) {
        array[i] = reader.string();
      }
      return array;
    }
    function isOptional(definition) {
      const { annotations } = definition;
      if (!annotations) {
        return false;
      }
      return "optional" in annotations;
    }
    function getHeaderNeeds(definition) {
      const { annotations } = definition;
      if (annotations) {
        if ("final" in annotations) {
          return { usesDelimiterHeader: false, usesMemberHeader: false };
        }
        if ("mutable" in annotations) {
          return { usesDelimiterHeader: true, usesMemberHeader: true };
        }
      }
      return { usesDelimiterHeader: true, usesMemberHeader: false };
    }
    function getDefinitionId(definition) {
      const { annotations } = definition;
      if (!annotations) {
        return void 0;
      }
      if (!("id" in annotations)) {
        return void 0;
      }
      const id = annotations.id;
      if (id?.type === "const-param" && typeof id.value === "number") {
        return id.value;
      }
      return void 0;
    }
  }
});

// node_modules/@foxglove/omgidl-serialization/dist/MessageReader.js
var require_MessageReader = __commonJS({
  "node_modules/@foxglove/omgidl-serialization/dist/MessageReader.js"(exports) {
    "use strict";
    var __classPrivateFieldSet = exports && exports.__classPrivateFieldSet || function(receiver, state, value, kind, f) {
      if (kind === "m") throw new TypeError("Private method is not writable");
      if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
      if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
      return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
    };
    var __classPrivateFieldGet = exports && exports.__classPrivateFieldGet || function(receiver, state, kind, f) {
      if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
      if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
      return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
    };
    var _MessageReader_lastMessageBufferEndReached;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MessageReader = void 0;
    var cdr_1 = require_dist2();
    var DeserializationInfoCache_1 = require_DeserializationInfoCache();
    var constants_1 = require_constants();
    var MessageReader2 = class {
      constructor(rootDefinitionName, definitions) {
        _MessageReader_lastMessageBufferEndReached.set(this, false);
        const rootDefinition = definitions.find((def) => def.name === rootDefinitionName);
        if (rootDefinition == void 0) {
          throw new Error(`Root definition name "${rootDefinitionName}" not found in schema definitions.`);
        }
        this.deserializationInfoCache = new DeserializationInfoCache_1.DeserializationInfoCache(definitions);
        this.rootDeserializationInfo = this.deserializationInfoCache.getComplexDeserializationInfo(rootDefinition);
      }
      // We template on R here for call site type information if the class type information T is not
      // known or available
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
      readMessage(buffer) {
        const reader = new cdr_1.CdrReader(buffer);
        const usesDelimiterHeader = reader.usesDelimiterHeader;
        const usesMemberHeader = reader.usesMemberHeader;
        const res = this.readAggregatedType(this.rootDeserializationInfo, reader, {
          usesDelimiterHeader,
          usesMemberHeader
        });
        __classPrivateFieldSet(this, _MessageReader_lastMessageBufferEndReached, reader.isAtEnd(), "f");
        return res;
      }
      lastMessageBufferEndReached() {
        return __classPrivateFieldGet(this, _MessageReader_lastMessageBufferEndReached, "f");
      }
      readAggregatedType(deserInfo, reader, options, knownTypeSize) {
        const readDelimiterHeader = options.usesDelimiterHeader && deserInfo.usesDelimiterHeader;
        let typeEndOffset = knownTypeSize != void 0 ? reader.offset + knownTypeSize : void 0;
        if (knownTypeSize == void 0 && readDelimiterHeader) {
          const objectSize = reader.dHeader();
          typeEndOffset = reader.offset + objectSize;
        }
        const msg = deserInfo.type === "struct" ? this.readStructType(deserInfo, reader, options, typeEndOffset) : this.readUnionType(deserInfo, reader, options, typeEndOffset);
        return msg;
      }
      readStructType(deserInfo, reader, options, typeEndOffset) {
        const usesMemberHeader = options.usesMemberHeader && deserInfo.usesMemberHeader;
        const usesDelimiterHeader = options.usesDelimiterHeader && deserInfo.usesDelimiterHeader;
        const msg = {};
        if (usesMemberHeader) {
          const fieldIndexesRead = /* @__PURE__ */ new Set();
          for (; ; ) {
            const atEndOfStruct = typeEndOffset != void 0 && reader.offset >= typeEndOffset;
            if (atEndOfStruct) {
              break;
            }
            const { objectSize, id, readSentinelHeader, lengthCode } = reader.emHeader();
            if (readSentinelHeader === true) {
              break;
            }
            const emHeaderSizeBytes = useEmHeaderAsLength(lengthCode) ? objectSize : void 0;
            const fieldIndex = deserInfo.fieldIndexById.get(id);
            const field = fieldIndex != void 0 ? deserInfo.fieldsInOrder[fieldIndex] : void 0;
            if (field == void 0 || fieldIndex == void 0) {
              reader.seekTo(reader.offset + objectSize);
              continue;
            }
            fieldIndexesRead.add(fieldIndex);
            msg[field.name] = this.readMemberFieldValue(field, reader, {
              usesDelimiterHeader,
              usesMemberHeader,
              parentName: deserInfo.definition.name ?? "<unnamed-struct>",
              emHeaderSizeBytes
            }, options);
          }
          for (let idx = 0; idx < deserInfo.fieldsInOrder.length; idx++) {
            const field = deserInfo.fieldsInOrder[idx];
            if (fieldIndexesRead.has(idx)) {
              continue;
            }
            if (field.isOptional) {
              msg[field.name] = void 0;
            } else {
              msg[field.name] = this.deserializationInfoCache.getFieldDefault(field);
            }
          }
        } else {
          for (const field of deserInfo.fieldsInOrder) {
            if (typeEndOffset != void 0 && reader.offset >= typeEndOffset) {
              break;
            }
            if (field.isOptional) {
              msg[field.name] = this.readOptionalFinalMember(field, reader, options, deserInfo.definition.name);
              continue;
            }
            msg[field.name] = this.readMemberFieldValue(field, reader, {
              usesDelimiterHeader,
              usesMemberHeader,
              parentName: deserInfo.definition.name ?? "<unnamed-struct>"
            }, options);
          }
          if (typeEndOffset != void 0 && reader.offset < typeEndOffset) {
            throw new Error(`Buffer for Appendable/Final struct ${deserInfo.definition.name ?? ""} was not read completely. This could be because the schema is missing fields that are present on the message.`);
          }
        }
        return msg;
      }
      readUnionType(deserInfo, reader, options, typeEndOffset) {
        const usesMemberHeader = options.usesMemberHeader && deserInfo.usesMemberHeader;
        const usesDelimiterHeader = options.usesDelimiterHeader && deserInfo.usesDelimiterHeader;
        if (usesMemberHeader) {
          const { objectSize: objectSizeBytes } = reader.emHeader();
          if (objectSizeBytes !== deserInfo.switchTypeLength) {
            throw new Error(`Expected switchType length of ${deserInfo.switchTypeLength} but got ${objectSizeBytes} for ${deserInfo.definition.name ?? ""}`);
          }
        }
        const discriminatorValue = deserInfo.switchTypeDeser(reader);
        let caseDefType = getCaseForDiscriminator(deserInfo.definition, discriminatorValue);
        caseDefType ?? (caseDefType = deserInfo.definition.defaultCase);
        const fieldDeserInfo = caseDefType ? this.deserializationInfoCache.buildFieldDeserInfo(caseDefType) : void 0;
        const hasSentinelHeader = !usesDelimiterHeader && usesMemberHeader;
        if (!fieldDeserInfo || !caseDefType) {
          if (typeEndOffset != void 0) {
            reader.seekTo(typeEndOffset);
          } else if (hasSentinelHeader) {
            for (; ; ) {
              const { objectSize, readSentinelHeader } = reader.emHeader();
              reader.seek(objectSize);
              if (readSentinelHeader === true) {
                break;
              }
            }
          } else {
            throw new Error("union's case is unknown, but cannot skip its body because its length is indeterminate");
          }
          return {
            [constants_1.UNION_DISCRIMINATOR_PROPERTY_KEY]: discriminatorValue
          };
        }
        let caseDefValue = void 0;
        if (usesMemberHeader) {
          const atEndOfUnion = typeEndOffset != void 0 && reader.offset >= typeEndOffset;
          const emHeader = !atEndOfUnion ? reader.emHeader() : void 0;
          if (atEndOfUnion || emHeader?.readSentinelHeader === true) {
            if (fieldDeserInfo.isOptional) {
              caseDefValue = void 0;
            } else {
              caseDefValue = this.deserializationInfoCache.getFieldDefault(fieldDeserInfo);
            }
          } else {
            const { objectSize, lengthCode } = emHeader;
            const emHeaderSizeBytes = useEmHeaderAsLength(lengthCode) ? objectSize : void 0;
            caseDefValue = this.readMemberFieldValue(fieldDeserInfo, reader, {
              usesDelimiterHeader,
              usesMemberHeader,
              parentName: deserInfo.definition.name ?? "<unnamed-union>",
              emHeaderSizeBytes
            }, options);
            if (hasSentinelHeader) {
              reader.sentinelHeader();
            }
          }
        } else {
          if (fieldDeserInfo.isOptional) {
            caseDefValue = this.readOptionalFinalMember(fieldDeserInfo, reader, options, deserInfo.definition.name);
          } else {
            caseDefValue = this.readMemberFieldValue(fieldDeserInfo, reader, {
              usesDelimiterHeader,
              usesMemberHeader,
              parentName: deserInfo.definition.name ?? "<unnamed-union>"
            }, options);
          }
        }
        return {
          [constants_1.UNION_DISCRIMINATOR_PROPERTY_KEY]: discriminatorValue,
          [caseDefType.name]: caseDefValue
        };
      }
      /**
       * Reads an optional final member of a struct or union.
       * Check for sentinel header before using.
       * @param field - The field to read.
       * @param reader - The reader to read from.
       * @param options - The options to use.
       * @returns The value of the field.
       */
      readOptionalFinalMember(field, reader, options, parentName) {
        if (reader.isCDR2) {
          const isPresent = reader.isPresentFlag();
          if (!isPresent) {
            return void 0;
          }
          return this.readMemberFieldValue(field, reader, {
            ...options,
            parentName: parentName ?? "<unnamed-struct>"
          }, options);
        } else {
          const { objectSize, lengthCode } = reader.emHeader();
          if (objectSize === 0) {
            return void 0;
          }
          const emHeaderSizeBytes = useEmHeaderAsLength(lengthCode) ? objectSize : void 0;
          return this.readMemberFieldValue(field, reader, {
            ...options,
            parentName: parentName ?? "<unnamed-struct>",
            emHeaderSizeBytes
          }, options);
        }
      }
      readMemberFieldValue(field, reader, headerOptions, childOptions) {
        const emHeaderSizeBytes = headerOptions.emHeaderSizeBytes;
        try {
          if (field.typeDeserInfo.type === "struct" || field.typeDeserInfo.type === "union") {
            if (field.isArray === true) {
              if (headerOptions.usesDelimiterHeader && !(!reader.isCDR2 && field.isOptional || headerOptions.usesMemberHeader)) {
                reader.dHeader();
              }
              const arrayLengths = field.arrayLengths ?? [reader.sequenceLength()];
              return this.readComplexNestedArray(reader, childOptions, field.typeDeserInfo, arrayLengths, 0);
            } else {
              return this.readAggregatedType(field.typeDeserInfo, reader, childOptions, emHeaderSizeBytes);
            }
          } else {
            const headerSpecifiedLength = emHeaderSizeBytes != void 0 ? Math.floor(emHeaderSizeBytes / field.typeDeserInfo.typeLength) : void 0;
            if (field.typeDeserInfo.type === "array-primitive") {
              const deser = field.typeDeserInfo.deserialize;
              if (headerOptions.usesDelimiterHeader && headerSpecifiedLength == void 0 && field.type === "string") {
                reader.dHeader();
              }
              const arrayLengths = field.arrayLengths ?? [
                headerSpecifiedLength ?? reader.sequenceLength()
              ];
              if (arrayLengths.length === 1) {
                return deser(reader, arrayLengths[0]);
              }
              const typedArrayDeserializer = () => {
                return deser(reader, arrayLengths[arrayLengths.length - 1]);
              };
              return (0, DeserializationInfoCache_1.makeNestedArray)(typedArrayDeserializer, arrayLengths.slice(0, -1), 0);
            } else if (field.typeDeserInfo.type === "primitive") {
              return field.typeDeserInfo.deserialize(reader, headerSpecifiedLength);
            } else {
              throw new Error(`Unhandled deserialization info type`);
            }
          }
        } catch (err2) {
          if (err2 instanceof Error) {
            err2.message = `${err2.message} in field ${field.name} of ${headerOptions.parentName} at location ${reader.offset}.`;
          }
          throw err2;
        }
      }
      readComplexNestedArray(reader, options, deserInfo, arrayLengths, depth) {
        if (depth > arrayLengths.length - 1 || depth < 0) {
          throw Error(`Invalid depth ${depth} for array of length ${arrayLengths.length}`);
        }
        const array = [];
        for (let i = 0; i < arrayLengths[depth]; i++) {
          if (depth === arrayLengths.length - 1) {
            array.push(this.readAggregatedType(deserInfo, reader, options));
          } else {
            array.push(this.readComplexNestedArray(reader, options, deserInfo, arrayLengths, depth + 1));
          }
        }
        return array;
      }
    };
    exports.MessageReader = MessageReader2;
    _MessageReader_lastMessageBufferEndReached = /* @__PURE__ */ new WeakMap();
    function getCaseForDiscriminator(unionDef, discriminatorValue) {
      for (const caseDef of unionDef.cases) {
        for (const predicate of caseDef.predicates) {
          if (predicate === discriminatorValue) {
            return caseDef.type;
          }
        }
      }
      return unionDef.defaultCase;
    }
    function useEmHeaderAsLength(lengthCode) {
      return lengthCode != void 0 && lengthCode >= 5;
    }
  }
});

// node_modules/@foxglove/omgidl-serialization/dist/MessageWriter.js
var require_MessageWriter = __commonJS({
  "node_modules/@foxglove/omgidl-serialization/dist/MessageWriter.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MessageWriter = void 0;
    var cdr_1 = require_dist2();
    var PRIMITIVE_SIZES = /* @__PURE__ */ new Map([
      ["bool", 1],
      ["int8", 1],
      ["uint8", 1],
      ["int16", 2],
      ["uint16", 2],
      ["int32", 4],
      ["uint32", 4],
      ["int64", 8],
      ["uint64", 8],
      ["float32", 4],
      ["float64", 8]
      // ["string", ...], // handled separately
    ]);
    var PRIMITIVE_WRITERS = /* @__PURE__ */ new Map([
      ["bool", bool],
      ["int8", int8],
      ["uint8", uint8],
      ["int16", int16],
      ["uint16", uint16],
      ["int32", int32],
      ["uint32", uint32],
      ["int64", int64],
      ["uint64", uint64],
      ["float32", float32],
      ["float64", float64],
      ["string", string]
    ]);
    var PRIMITIVE_ARRAY_WRITERS = /* @__PURE__ */ new Map([
      ["bool", boolArray],
      ["int8", int8Array],
      ["uint8", uint8Array],
      ["int16", int16Array],
      ["uint16", uint16Array],
      ["int32", int32Array],
      ["uint32", uint32Array],
      ["int64", int64Array],
      ["uint64", uint64Array],
      ["float32", float32Array],
      ["float64", float64Array],
      ["string", stringArray]
    ]);
    var MessageWriter = class {
      constructor(rootDefinitionName, definitions, cdrOptions) {
        const rootDefinition = definitions.find((def) => def.name === rootDefinitionName);
        if (rootDefinition == void 0) {
          throw new Error(`Root definition name "${rootDefinitionName}" not found in schema definitions.`);
        }
        if (rootDefinition.aggregatedKind === "union") {
          throw new Error(`Unions are not yet supported by MessageWriter`);
        }
        this.rootDefinition = rootDefinition.definitions;
        this.definitions = new Map(definitions.flatMap((def) => def.aggregatedKind !== "union" ? [[def.name ?? "", def.definitions]] : []));
        this.cdrOptions = cdrOptions ?? {};
      }
      /** Calculates the byte size needed to write this message in bytes. */
      calculateByteSize(message) {
        return this.byteSize(this.rootDefinition, message, 4);
      }
      /**
       * Serializes a JavaScript object to CDR-encoded binary according to this
       * writer's message definition. If output is provided, it's byte length must
       * be equal or greater to the result of `calculateByteSize(message)`. If not
       * provided, a new Uint8Array will be allocated.
       */
      writeMessage(message, output) {
        const writer = new cdr_1.CdrWriter({
          ...this.cdrOptions,
          buffer: output,
          size: output ? void 0 : this.calculateByteSize(message)
        });
        this.write(this.rootDefinition, message, writer);
        return writer.data;
      }
      byteSize(definition, message, offset) {
        const messageObj = message;
        let newOffset = offset;
        for (const field of definition) {
          if (field.isConstant === true) {
            continue;
          }
          const nestedMessage = messageObj?.[field.name];
          if (field.isArray === true) {
            const arrayLength = field.arrayLengths ? field.arrayLengths[0] : fieldLength(nestedMessage);
            const dataIsArray = Array.isArray(nestedMessage) || ArrayBuffer.isView(nestedMessage);
            const dataArray = dataIsArray ? nestedMessage : [];
            if (field.arrayLengths == void 0) {
              newOffset += padding(newOffset, 4);
              newOffset += 4;
            }
            if (field.isComplex === true) {
              const nestedDefinition = this.getDefinition(field.type);
              for (let i = 0; i < arrayLength; i++) {
                const entry = dataArray[i] ?? {};
                newOffset = this.byteSize(nestedDefinition, entry, newOffset);
              }
            } else if (field.type === "string") {
              for (let i = 0; i < arrayLength; i++) {
                const entry = dataArray[i] ?? "";
                newOffset += padding(newOffset, 4);
                newOffset += 4 + entry.length + 1;
              }
            } else {
              const entrySize = this.getPrimitiveSize(field.type);
              const alignment = entrySize;
              newOffset += padding(newOffset, alignment);
              newOffset += entrySize * arrayLength;
            }
          } else {
            if (field.isComplex === true) {
              const nestedDefinition = this.getDefinition(field.type);
              const entry = nestedMessage ?? {};
              newOffset = this.byteSize(nestedDefinition, entry, newOffset);
            } else if (field.type === "string") {
              const entry = typeof nestedMessage === "string" ? nestedMessage : "";
              newOffset += padding(newOffset, 4);
              newOffset += 4 + entry.length + 1;
            } else {
              const entrySize = this.getPrimitiveSize(field.type);
              const alignment = entrySize;
              newOffset += padding(newOffset, alignment);
              newOffset += entrySize;
            }
          }
        }
        return newOffset;
      }
      write(definition, message, writer) {
        const messageObj = message;
        for (const field of definition) {
          if (field.isConstant === true) {
            continue;
          }
          const nestedMessage = messageObj?.[field.name];
          if (field.isArray === true) {
            const arrayLength = field.arrayLengths ? field.arrayLengths[0] : fieldLength(nestedMessage);
            const dataIsArray = Array.isArray(nestedMessage) || ArrayBuffer.isView(nestedMessage);
            const dataArray = dataIsArray ? nestedMessage : [];
            if (field.arrayLengths == void 0) {
              writer.sequenceLength(arrayLength);
            }
            if (field.isComplex === true) {
              const nestedDefinition = this.getDefinition(field.type);
              for (let i = 0; i < arrayLength; i++) {
                const entry = dataArray[i] ?? {};
                this.write(nestedDefinition, entry, writer);
              }
            } else {
              const arrayWriter = this.getPrimitiveArrayWriter(field.type);
              arrayWriter(nestedMessage, field.defaultValue, writer);
            }
          } else {
            if (field.isComplex === true) {
              const nestedDefinition = this.getDefinition(field.type);
              const entry = nestedMessage ?? {};
              this.write(nestedDefinition, entry, writer);
            } else {
              const primitiveWriter = this.getPrimitiveWriter(field.type);
              primitiveWriter(nestedMessage, field.defaultValue, writer);
            }
          }
        }
      }
      getDefinition(datatype) {
        const nestedDefinition = this.definitions.get(datatype);
        if (nestedDefinition == void 0) {
          throw new Error(`Unrecognized complex type ${datatype}`);
        }
        return nestedDefinition;
      }
      getPrimitiveSize(primitiveType) {
        const size = PRIMITIVE_SIZES.get(primitiveType);
        if (size == void 0) {
          throw new Error(`Unrecognized primitive type ${primitiveType}`);
        }
        return size;
      }
      getPrimitiveWriter(primitiveType) {
        const writer = PRIMITIVE_WRITERS.get(primitiveType);
        if (writer == void 0) {
          throw new Error(`Unrecognized primitive type ${primitiveType}`);
        }
        return writer;
      }
      getPrimitiveArrayWriter(primitiveType) {
        const writer = PRIMITIVE_ARRAY_WRITERS.get(primitiveType);
        if (writer == void 0) {
          throw new Error(`Unrecognized primitive type ${primitiveType}[]`);
        }
        return writer;
      }
    };
    exports.MessageWriter = MessageWriter;
    function fieldLength(value) {
      const length = value?.length;
      return typeof length === "number" ? length : 0;
    }
    function bool(value, defaultValue, writer) {
      const boolValue = typeof value === "boolean" ? value : defaultValue ?? false;
      writer.int8(boolValue ? 1 : 0);
    }
    function int8(value, defaultValue, writer) {
      writer.int8(typeof value === "number" ? value : defaultValue ?? 0);
    }
    function uint8(value, defaultValue, writer) {
      writer.uint8(typeof value === "number" ? value : defaultValue ?? 0);
    }
    function int16(value, defaultValue, writer) {
      writer.int16(typeof value === "number" ? value : defaultValue ?? 0);
    }
    function uint16(value, defaultValue, writer) {
      writer.uint16(typeof value === "number" ? value : defaultValue ?? 0);
    }
    function int32(value, defaultValue, writer) {
      writer.int32(typeof value === "number" ? value : defaultValue ?? 0);
    }
    function uint32(value, defaultValue, writer) {
      writer.uint32(typeof value === "number" ? value : defaultValue ?? 0);
    }
    function int64(value, defaultValue, writer) {
      if (typeof value === "bigint") {
        writer.int64(value);
      } else if (typeof value === "number") {
        writer.int64(BigInt(value));
      } else {
        writer.int64(defaultValue ?? 0n);
      }
    }
    function uint64(value, defaultValue, writer) {
      if (typeof value === "bigint") {
        writer.uint64(value);
      } else if (typeof value === "number") {
        writer.uint64(BigInt(value));
      } else {
        writer.uint64(defaultValue ?? 0n);
      }
    }
    function float32(value, defaultValue, writer) {
      writer.float32(typeof value === "number" ? value : defaultValue ?? 0);
    }
    function float64(value, defaultValue, writer) {
      writer.float64(typeof value === "number" ? value : defaultValue ?? 0);
    }
    function string(value, defaultValue, writer) {
      writer.string(typeof value === "string" ? value : defaultValue ?? "");
    }
    function boolArray(value, defaultValue, writer) {
      if (Array.isArray(value)) {
        const array = new Int8Array(value);
        writer.int8Array(array);
      } else {
        writer.int8Array(defaultValue ?? []);
      }
    }
    function int8Array(value, defaultValue, writer) {
      if (value instanceof Int8Array) {
        writer.int8Array(value);
      } else if (Array.isArray(value)) {
        const array = new Int8Array(value);
        writer.int8Array(array);
      } else {
        writer.int8Array(defaultValue ?? []);
      }
    }
    function uint8Array(value, defaultValue, writer) {
      if (value instanceof Uint8Array) {
        writer.uint8Array(value);
      } else if (value instanceof Uint8ClampedArray) {
        writer.uint8Array(new Uint8Array(value));
      } else if (Array.isArray(value)) {
        const array = new Uint8Array(value);
        writer.uint8Array(array);
      } else {
        writer.uint8Array(defaultValue ?? []);
      }
    }
    function int16Array(value, defaultValue, writer) {
      if (value instanceof Int16Array) {
        writer.int16Array(value);
      } else if (Array.isArray(value)) {
        const array = new Int16Array(value);
        writer.int16Array(array);
      } else {
        writer.int16Array(defaultValue ?? []);
      }
    }
    function uint16Array(value, defaultValue, writer) {
      if (value instanceof Uint16Array) {
        writer.uint16Array(value);
      } else if (Array.isArray(value)) {
        const array = new Uint16Array(value);
        writer.uint16Array(array);
      } else {
        writer.uint16Array(defaultValue ?? []);
      }
    }
    function int32Array(value, defaultValue, writer) {
      if (value instanceof Int32Array) {
        writer.int32Array(value);
      } else if (Array.isArray(value)) {
        const array = new Int32Array(value);
        writer.int32Array(array);
      } else {
        writer.int32Array(defaultValue ?? []);
      }
    }
    function uint32Array(value, defaultValue, writer) {
      if (value instanceof Uint32Array) {
        writer.uint32Array(value);
      } else if (Array.isArray(value)) {
        const array = new Uint32Array(value);
        writer.uint32Array(array);
      } else {
        writer.uint32Array(defaultValue ?? []);
      }
    }
    function int64Array(value, defaultValue, writer) {
      if (value instanceof BigInt64Array) {
        writer.int64Array(value);
      } else if (Array.isArray(value)) {
        const array = new BigInt64Array(value);
        writer.int64Array(array);
      } else {
        writer.int64Array(defaultValue ?? []);
      }
    }
    function uint64Array(value, defaultValue, writer) {
      if (value instanceof BigUint64Array) {
        writer.uint64Array(value);
      } else if (Array.isArray(value)) {
        const array = new BigUint64Array(value);
        writer.uint64Array(array);
      } else {
        writer.uint64Array(defaultValue ?? []);
      }
    }
    function float32Array(value, defaultValue, writer) {
      if (value instanceof Float32Array) {
        writer.float32Array(value);
      } else if (Array.isArray(value)) {
        const array = new Float32Array(value);
        writer.float32Array(array);
      } else {
        writer.float32Array(defaultValue ?? []);
      }
    }
    function float64Array(value, defaultValue, writer) {
      if (value instanceof Float64Array) {
        writer.float64Array(value);
      } else if (Array.isArray(value)) {
        const array = new Float64Array(value);
        writer.float64Array(array);
      } else {
        writer.float64Array(defaultValue ?? []);
      }
    }
    function stringArray(value, defaultValue, writer) {
      if (Array.isArray(value)) {
        for (const item of value) {
          writer.string(typeof item === "string" ? item : "");
        }
      } else {
        const array = defaultValue ?? [];
        for (const item of array) {
          writer.string(item);
        }
      }
    }
    function padding(offset, byteWidth) {
      const alignment = (offset - 4) % byteWidth;
      return alignment > 0 ? byteWidth - alignment : 0;
    }
  }
});

// node_modules/@foxglove/omgidl-serialization/dist/index.js
var require_dist3 = __commonJS({
  "node_modules/@foxglove/omgidl-serialization/dist/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(require_MessageReader(), exports);
    __exportStar(require_MessageWriter(), exports);
    __exportStar(require_constants(), exports);
  }
});

// node_modules/@foxglove/crc/dist/esm/src/index.js
function crc32GenerateTables({ polynomial, numTables }) {
  const table = new Uint32Array(256 * numTables);
  for (let i = 0; i < 256; i++) {
    let r = i;
    r = (r & 1) * polynomial ^ r >>> 1;
    r = (r & 1) * polynomial ^ r >>> 1;
    r = (r & 1) * polynomial ^ r >>> 1;
    r = (r & 1) * polynomial ^ r >>> 1;
    r = (r & 1) * polynomial ^ r >>> 1;
    r = (r & 1) * polynomial ^ r >>> 1;
    r = (r & 1) * polynomial ^ r >>> 1;
    r = (r & 1) * polynomial ^ r >>> 1;
    table[i] = r;
  }
  for (let i = 256; i < table.length; i++) {
    const value = table[i - 256];
    table[i] = table[value & 255] ^ value >>> 8;
  }
  return table;
}
var CRC32_TABLE = crc32GenerateTables({ polynomial: 3988292384, numTables: 8 });
function crc32Init() {
  return ~0;
}
function crc32Update(prev, data) {
  const byteLength = data.byteLength;
  const view = new DataView(data.buffer, data.byteOffset, byteLength);
  let r = prev;
  let offset = 0;
  const toAlign = -view.byteOffset & 3;
  for (; offset < toAlign && offset < byteLength; offset++) {
    r = CRC32_TABLE[(r ^ view.getUint8(offset)) & 255] ^ r >>> 8;
  }
  if (offset === byteLength) {
    return r;
  }
  offset = toAlign;
  let remainingBytes = byteLength - offset;
  for (; remainingBytes >= 8; offset += 8, remainingBytes -= 8) {
    r ^= view.getUint32(offset, true);
    const r2 = view.getUint32(offset + 4, true);
    r = CRC32_TABLE[0 * 256 + (r2 >>> 24 & 255)] ^ CRC32_TABLE[1 * 256 + (r2 >>> 16 & 255)] ^ CRC32_TABLE[2 * 256 + (r2 >>> 8 & 255)] ^ CRC32_TABLE[3 * 256 + (r2 >>> 0 & 255)] ^ CRC32_TABLE[4 * 256 + (r >>> 24 & 255)] ^ CRC32_TABLE[5 * 256 + (r >>> 16 & 255)] ^ CRC32_TABLE[6 * 256 + (r >>> 8 & 255)] ^ CRC32_TABLE[7 * 256 + (r >>> 0 & 255)];
  }
  for (let i = offset; i < byteLength; i++) {
    r = CRC32_TABLE[(r ^ view.getUint8(i)) & 255] ^ r >>> 8;
  }
  return r;
}
function crc32Final(prev) {
  return (prev ^ ~0) >>> 0;
}
function crc32(data) {
  return crc32Final(crc32Update(crc32Init(), data));
}

// node_modules/heap-js/dist/heap-js.es5.js
var __awaiter = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$1 = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var __read$1 = function(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
};
var __spreadArray$1 = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var __values = function(o) {
  var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
  if (m) return m.call(o);
  if (o && typeof o.length === "number") return {
    next: function() {
      if (o && i >= o.length) o = void 0;
      return { value: o && o[i++], done: !o };
    }
  };
  throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var HeapAsync = (
  /** @class */
  (function() {
    function HeapAsync2(compare) {
      if (compare === void 0) {
        compare = HeapAsync2.minComparator;
      }
      var _this = this;
      this.compare = compare;
      this.heapArray = [];
      this._limit = 0;
      this.offer = this.add;
      this.element = this.peek;
      this.poll = this.pop;
      this._invertedCompare = function(a, b) {
        return _this.compare(a, b).then(function(res) {
          return -1 * res;
        });
      };
    }
    HeapAsync2.getChildrenIndexOf = function(idx) {
      return [idx * 2 + 1, idx * 2 + 2];
    };
    HeapAsync2.getParentIndexOf = function(idx) {
      if (idx <= 0) {
        return -1;
      }
      var whichChildren = idx % 2 ? 1 : 2;
      return Math.floor((idx - whichChildren) / 2);
    };
    HeapAsync2.getSiblingIndexOf = function(idx) {
      if (idx <= 0) {
        return -1;
      }
      var whichChildren = idx % 2 ? 1 : -1;
      return idx + whichChildren;
    };
    HeapAsync2.minComparator = function(a, b) {
      return __awaiter(this, void 0, void 0, function() {
        return __generator$1(this, function(_a) {
          if (a > b) {
            return [2, 1];
          } else if (a < b) {
            return [2, -1];
          } else {
            return [2, 0];
          }
        });
      });
    };
    HeapAsync2.maxComparator = function(a, b) {
      return __awaiter(this, void 0, void 0, function() {
        return __generator$1(this, function(_a) {
          if (b > a) {
            return [2, 1];
          } else if (b < a) {
            return [2, -1];
          } else {
            return [2, 0];
          }
        });
      });
    };
    HeapAsync2.minComparatorNumber = function(a, b) {
      return __awaiter(this, void 0, void 0, function() {
        return __generator$1(this, function(_a) {
          return [2, a - b];
        });
      });
    };
    HeapAsync2.maxComparatorNumber = function(a, b) {
      return __awaiter(this, void 0, void 0, function() {
        return __generator$1(this, function(_a) {
          return [2, b - a];
        });
      });
    };
    HeapAsync2.defaultIsEqual = function(a, b) {
      return __awaiter(this, void 0, void 0, function() {
        return __generator$1(this, function(_a) {
          return [2, a === b];
        });
      });
    };
    HeapAsync2.print = function(heap) {
      function deep(i2) {
        var pi = HeapAsync2.getParentIndexOf(i2);
        return Math.floor(Math.log2(pi + 1));
      }
      function repeat(str, times) {
        var out = "";
        for (; times > 0; --times) {
          out += str;
        }
        return out;
      }
      var node = 0;
      var lines = [];
      var maxLines = deep(heap.length - 1) + 2;
      var maxLength = 0;
      while (node < heap.length) {
        var i = deep(node) + 1;
        if (node === 0) {
          i = 0;
        }
        var nodeText = String(heap.get(node));
        if (nodeText.length > maxLength) {
          maxLength = nodeText.length;
        }
        lines[i] = lines[i] || [];
        lines[i].push(nodeText);
        node += 1;
      }
      return lines.map(function(line, i2) {
        var times = Math.pow(2, maxLines - i2) - 1;
        return repeat(" ", Math.floor(times / 2) * maxLength) + line.map(function(el) {
          var half = (maxLength - el.length) / 2;
          return repeat(" ", Math.ceil(half)) + el + repeat(" ", Math.floor(half));
        }).join(repeat(" ", times * maxLength));
      }).join("\n");
    };
    HeapAsync2.heapify = function(arr, compare) {
      return __awaiter(this, void 0, void 0, function() {
        var heap;
        return __generator$1(this, function(_a) {
          switch (_a.label) {
            case 0:
              heap = new HeapAsync2(compare);
              heap.heapArray = arr;
              return [4, heap.init()];
            case 1:
              _a.sent();
              return [2, heap];
          }
        });
      });
    };
    HeapAsync2.heappop = function(heapArr, compare) {
      var heap = new HeapAsync2(compare);
      heap.heapArray = heapArr;
      return heap.pop();
    };
    HeapAsync2.heappush = function(heapArr, item, compare) {
      return __awaiter(this, void 0, void 0, function() {
        var heap;
        return __generator$1(this, function(_a) {
          switch (_a.label) {
            case 0:
              heap = new HeapAsync2(compare);
              heap.heapArray = heapArr;
              return [4, heap.push(item)];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    HeapAsync2.heappushpop = function(heapArr, item, compare) {
      var heap = new HeapAsync2(compare);
      heap.heapArray = heapArr;
      return heap.pushpop(item);
    };
    HeapAsync2.heapreplace = function(heapArr, item, compare) {
      var heap = new HeapAsync2(compare);
      heap.heapArray = heapArr;
      return heap.replace(item);
    };
    HeapAsync2.heaptop = function(heapArr, n, compare) {
      if (n === void 0) {
        n = 1;
      }
      var heap = new HeapAsync2(compare);
      heap.heapArray = heapArr;
      return heap.top(n);
    };
    HeapAsync2.heapbottom = function(heapArr, n, compare) {
      if (n === void 0) {
        n = 1;
      }
      var heap = new HeapAsync2(compare);
      heap.heapArray = heapArr;
      return heap.bottom(n);
    };
    HeapAsync2.nlargest = function(n, iterable, compare) {
      return __awaiter(this, void 0, void 0, function() {
        var heap;
        return __generator$1(this, function(_a) {
          switch (_a.label) {
            case 0:
              heap = new HeapAsync2(compare);
              heap.heapArray = __spreadArray$1([], __read$1(iterable), false);
              return [4, heap.init()];
            case 1:
              _a.sent();
              return [2, heap.top(n)];
          }
        });
      });
    };
    HeapAsync2.nsmallest = function(n, iterable, compare) {
      return __awaiter(this, void 0, void 0, function() {
        var heap;
        return __generator$1(this, function(_a) {
          switch (_a.label) {
            case 0:
              heap = new HeapAsync2(compare);
              heap.heapArray = __spreadArray$1([], __read$1(iterable), false);
              return [4, heap.init()];
            case 1:
              _a.sent();
              return [2, heap.bottom(n)];
          }
        });
      });
    };
    HeapAsync2.prototype.add = function(element) {
      return __awaiter(this, void 0, void 0, function() {
        return __generator$1(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this._sortNodeUp(this.heapArray.push(element) - 1)];
            case 1:
              _a.sent();
              this._applyLimit();
              return [2, true];
          }
        });
      });
    };
    HeapAsync2.prototype.addAll = function(elements) {
      return __awaiter(this, void 0, void 0, function() {
        var i, l;
        var _a;
        return __generator$1(this, function(_b) {
          switch (_b.label) {
            case 0:
              i = this.length;
              (_a = this.heapArray).push.apply(_a, __spreadArray$1([], __read$1(elements), false));
              l = this.length;
              _b.label = 1;
            case 1:
              if (!(i < l)) return [3, 4];
              return [4, this._sortNodeUp(i)];
            case 2:
              _b.sent();
              _b.label = 3;
            case 3:
              ++i;
              return [3, 1];
            case 4:
              this._applyLimit();
              return [2, true];
          }
        });
      });
    };
    HeapAsync2.prototype.bottom = function() {
      return __awaiter(this, arguments, void 0, function(n) {
        if (n === void 0) {
          n = 1;
        }
        return __generator$1(this, function(_a) {
          if (this.heapArray.length === 0 || n <= 0) {
            return [2, []];
          } else if (this.heapArray.length === 1) {
            return [2, [this.heapArray[0]]];
          } else if (n >= this.heapArray.length) {
            return [2, __spreadArray$1([], __read$1(this.heapArray), false)];
          } else {
            return [2, this._bottomN_push(~~n)];
          }
        });
      });
    };
    HeapAsync2.prototype.check = function() {
      return __awaiter(this, void 0, void 0, function() {
        var j, el, children, children_1, children_1_1, ch, e_1_1;
        var e_1, _a;
        return __generator$1(this, function(_b) {
          switch (_b.label) {
            case 0:
              j = 0;
              _b.label = 1;
            case 1:
              if (!(j < this.heapArray.length)) return [3, 10];
              el = this.heapArray[j];
              children = this.getChildrenOf(j);
              _b.label = 2;
            case 2:
              _b.trys.push([2, 7, 8, 9]);
              children_1 = (e_1 = void 0, __values(children)), children_1_1 = children_1.next();
              _b.label = 3;
            case 3:
              if (!!children_1_1.done) return [3, 6];
              ch = children_1_1.value;
              return [4, this.compare(el, ch)];
            case 4:
              if (_b.sent() > 0) {
                return [2, el];
              }
              _b.label = 5;
            case 5:
              children_1_1 = children_1.next();
              return [3, 3];
            case 6:
              return [3, 9];
            case 7:
              e_1_1 = _b.sent();
              e_1 = { error: e_1_1 };
              return [3, 9];
            case 8:
              try {
                if (children_1_1 && !children_1_1.done && (_a = children_1.return)) _a.call(children_1);
              } finally {
                if (e_1) throw e_1.error;
              }
              return [
                7
                /*endfinally*/
              ];
            case 9:
              ++j;
              return [3, 1];
            case 10:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    HeapAsync2.prototype.clear = function() {
      this.heapArray = [];
    };
    HeapAsync2.prototype.clone = function() {
      var cloned = new HeapAsync2(this.comparator());
      cloned.heapArray = this.toArray();
      cloned._limit = this._limit;
      return cloned;
    };
    HeapAsync2.prototype.comparator = function() {
      return this.compare;
    };
    HeapAsync2.prototype.contains = function(o_1) {
      return __awaiter(this, arguments, void 0, function(o, fn) {
        var _a, _b, el, e_2_1;
        var e_2, _c;
        if (fn === void 0) {
          fn = HeapAsync2.defaultIsEqual;
        }
        return __generator$1(this, function(_d) {
          switch (_d.label) {
            case 0:
              _d.trys.push([0, 5, 6, 7]);
              _a = __values(this.heapArray), _b = _a.next();
              _d.label = 1;
            case 1:
              if (!!_b.done) return [3, 4];
              el = _b.value;
              return [4, fn(el, o)];
            case 2:
              if (_d.sent()) {
                return [2, true];
              }
              _d.label = 3;
            case 3:
              _b = _a.next();
              return [3, 1];
            case 4:
              return [3, 7];
            case 5:
              e_2_1 = _d.sent();
              e_2 = { error: e_2_1 };
              return [3, 7];
            case 6:
              try {
                if (_b && !_b.done && (_c = _a.return)) _c.call(_a);
              } finally {
                if (e_2) throw e_2.error;
              }
              return [
                7
                /*endfinally*/
              ];
            case 7:
              return [2, false];
          }
        });
      });
    };
    HeapAsync2.prototype.init = function(array) {
      return __awaiter(this, void 0, void 0, function() {
        var i;
        return __generator$1(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (array) {
                this.heapArray = __spreadArray$1([], __read$1(array), false);
              }
              i = HeapAsync2.getParentIndexOf(this.length - 1);
              _a.label = 1;
            case 1:
              if (!(i >= 0)) return [3, 4];
              return [4, this._sortNodeDown(i)];
            case 2:
              _a.sent();
              _a.label = 3;
            case 3:
              --i;
              return [3, 1];
            case 4:
              this._applyLimit();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    HeapAsync2.prototype.isEmpty = function() {
      return this.length === 0;
    };
    HeapAsync2.prototype.leafs = function() {
      if (this.heapArray.length === 0) {
        return [];
      }
      var pi = HeapAsync2.getParentIndexOf(this.heapArray.length - 1);
      return this.heapArray.slice(pi + 1);
    };
    Object.defineProperty(HeapAsync2.prototype, "length", {
      /**
       * Length of the heap.
       * @return {Number}
       */
      get: function() {
        return this.heapArray.length;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(HeapAsync2.prototype, "limit", {
      /**
       * Get length limit of the heap.
       * @return {Number}
       */
      get: function() {
        return this._limit;
      },
      /**
       * Set length limit of the heap.
       * @return {Number}
       */
      set: function(_l) {
        this._limit = ~~_l;
        this._applyLimit();
      },
      enumerable: false,
      configurable: true
    });
    HeapAsync2.prototype.peek = function() {
      return this.heapArray[0];
    };
    HeapAsync2.prototype.pop = function() {
      return __awaiter(this, void 0, void 0, function() {
        var last;
        return __generator$1(this, function(_a) {
          last = this.heapArray.pop();
          if (this.length > 0 && last !== void 0) {
            return [2, this.replace(last)];
          }
          return [2, last];
        });
      });
    };
    HeapAsync2.prototype.push = function() {
      var elements = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        elements[_i] = arguments[_i];
      }
      return __awaiter(this, void 0, void 0, function() {
        return __generator$1(this, function(_a) {
          if (elements.length < 1) {
            return [2, false];
          } else if (elements.length === 1) {
            return [2, this.add(elements[0])];
          } else {
            return [2, this.addAll(elements)];
          }
        });
      });
    };
    HeapAsync2.prototype.pushpop = function(element) {
      return __awaiter(this, void 0, void 0, function() {
        var _a;
        return __generator$1(this, function(_b) {
          switch (_b.label) {
            case 0:
              return [4, this.compare(this.heapArray[0], element)];
            case 1:
              if (!(_b.sent() < 0)) return [3, 3];
              _a = __read$1([this.heapArray[0], element], 2), element = _a[0], this.heapArray[0] = _a[1];
              return [4, this._sortNodeDown(0)];
            case 2:
              _b.sent();
              _b.label = 3;
            case 3:
              return [2, element];
          }
        });
      });
    };
    HeapAsync2.prototype.remove = function(o_1) {
      return __awaiter(this, arguments, void 0, function(o, fn) {
        var queue, idx, children;
        var _this = this;
        if (fn === void 0) {
          fn = HeapAsync2.defaultIsEqual;
        }
        return __generator$1(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (!this.heapArray.length)
                return [2, false];
              if (!(o === void 0)) return [3, 2];
              return [4, this.pop()];
            case 1:
              _a.sent();
              return [2, true];
            case 2:
              queue = [0];
              _a.label = 3;
            case 3:
              if (!queue.length) return [3, 13];
              idx = queue.shift();
              return [4, fn(this.heapArray[idx], o)];
            case 4:
              if (!_a.sent()) return [3, 11];
              if (!(idx === 0)) return [3, 6];
              return [4, this.pop()];
            case 5:
              _a.sent();
              return [3, 10];
            case 6:
              if (!(idx === this.heapArray.length - 1)) return [3, 7];
              this.heapArray.pop();
              return [3, 10];
            case 7:
              this.heapArray.splice(idx, 1, this.heapArray.pop());
              return [4, this._sortNodeUp(idx)];
            case 8:
              _a.sent();
              return [4, this._sortNodeDown(idx)];
            case 9:
              _a.sent();
              _a.label = 10;
            case 10:
              return [2, true];
            case 11:
              children = HeapAsync2.getChildrenIndexOf(idx).filter(function(c) {
                return c < _this.heapArray.length;
              });
              queue.push.apply(queue, __spreadArray$1([], __read$1(children), false));
              _a.label = 12;
            case 12:
              return [3, 3];
            case 13:
              return [2, false];
          }
        });
      });
    };
    HeapAsync2.prototype.replace = function(element) {
      return __awaiter(this, void 0, void 0, function() {
        var peek;
        return __generator$1(this, function(_a) {
          switch (_a.label) {
            case 0:
              peek = this.heapArray[0];
              this.heapArray[0] = element;
              return [4, this._sortNodeDown(0)];
            case 1:
              _a.sent();
              return [2, peek];
          }
        });
      });
    };
    HeapAsync2.prototype.size = function() {
      return this.length;
    };
    HeapAsync2.prototype.top = function() {
      return __awaiter(this, arguments, void 0, function(n) {
        if (n === void 0) {
          n = 1;
        }
        return __generator$1(this, function(_a) {
          if (this.heapArray.length === 0 || n <= 0) {
            return [2, []];
          } else if (this.heapArray.length === 1 || n === 1) {
            return [2, [this.heapArray[0]]];
          } else if (n >= this.heapArray.length) {
            return [2, __spreadArray$1([], __read$1(this.heapArray), false)];
          } else {
            return [2, this._topN_push(~~n)];
          }
        });
      });
    };
    HeapAsync2.prototype.toArray = function() {
      return __spreadArray$1([], __read$1(this.heapArray), false);
    };
    HeapAsync2.prototype.toString = function() {
      return this.heapArray.toString();
    };
    HeapAsync2.prototype.get = function(i) {
      return this.heapArray[i];
    };
    HeapAsync2.prototype.getChildrenOf = function(idx) {
      var _this = this;
      return HeapAsync2.getChildrenIndexOf(idx).map(function(i) {
        return _this.heapArray[i];
      }).filter(function(e) {
        return e !== void 0;
      });
    };
    HeapAsync2.prototype.getParentOf = function(idx) {
      var pi = HeapAsync2.getParentIndexOf(idx);
      return this.heapArray[pi];
    };
    HeapAsync2.prototype[Symbol.iterator] = function() {
      return __generator$1(this, function(_a) {
        switch (_a.label) {
          case 0:
            if (!this.length) return [3, 2];
            return [4, this.pop()];
          case 1:
            _a.sent();
            return [3, 0];
          case 2:
            return [
              2
              /*return*/
            ];
        }
      });
    };
    HeapAsync2.prototype.iterator = function() {
      return this;
    };
    HeapAsync2.prototype._applyLimit = function() {
      if (this._limit && this._limit < this.heapArray.length) {
        var rm = this.heapArray.length - this._limit;
        while (rm) {
          this.heapArray.pop();
          --rm;
        }
      }
    };
    HeapAsync2.prototype._bottomN_push = function(n) {
      return __awaiter(this, void 0, void 0, function() {
        var bottomHeap, startAt, parentStartAt, indices, i, arr, i;
        return __generator$1(this, function(_a) {
          switch (_a.label) {
            case 0:
              bottomHeap = new HeapAsync2(this.compare);
              bottomHeap.limit = n;
              bottomHeap.heapArray = this.heapArray.slice(-n);
              return [4, bottomHeap.init()];
            case 1:
              _a.sent();
              startAt = this.heapArray.length - 1 - n;
              parentStartAt = HeapAsync2.getParentIndexOf(startAt);
              indices = [];
              for (i = startAt; i > parentStartAt; --i) {
                indices.push(i);
              }
              arr = this.heapArray;
              _a.label = 2;
            case 2:
              if (!indices.length) return [3, 6];
              i = indices.shift();
              return [4, this.compare(arr[i], bottomHeap.peek())];
            case 3:
              if (!(_a.sent() > 0)) return [3, 5];
              return [4, bottomHeap.replace(arr[i])];
            case 4:
              _a.sent();
              if (i % 2) {
                indices.push(HeapAsync2.getParentIndexOf(i));
              }
              _a.label = 5;
            case 5:
              return [3, 2];
            case 6:
              return [2, bottomHeap.toArray()];
          }
        });
      });
    };
    HeapAsync2.prototype._moveNode = function(j, k) {
      var temp = this.heapArray[j];
      this.heapArray[j] = this.heapArray[k];
      this.heapArray[k] = temp;
    };
    HeapAsync2.prototype._sortNodeDown = function(i) {
      return __awaiter(this, void 0, void 0, function() {
        var length, originalIndex, value, left, right, best, _a;
        return __generator$1(this, function(_b) {
          switch (_b.label) {
            case 0:
              length = this.heapArray.length;
              originalIndex = i;
              value = this.heapArray[i];
              left = 2 * i + 1;
              _b.label = 1;
            case 1:
              if (!(left < length)) return [3, 5];
              right = left + 1;
              _a = right >= length;
              if (_a) return [3, 3];
              return [4, this.compare(this.heapArray[left], this.heapArray[right])];
            case 2:
              _a = _b.sent() < 0;
              _b.label = 3;
            case 3:
              best = _a ? left : right;
              return [4, this.compare(this.heapArray[best], value)];
            case 4:
              if (_b.sent() < 0) {
                this.heapArray[i] = this.heapArray[best];
                i = best;
                left = 2 * i + 1;
              } else
                return [3, 5];
              return [3, 1];
            case 5:
              if (i !== originalIndex) {
                this.heapArray[i] = value;
              }
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    HeapAsync2.prototype._sortNodeUp = function(i) {
      return __awaiter(this, void 0, void 0, function() {
        var value, originalIndex, pi;
        return __generator$1(this, function(_a) {
          switch (_a.label) {
            case 0:
              value = this.heapArray[i];
              originalIndex = i;
              _a.label = 1;
            case 1:
              if (!(i > 0)) return [3, 3];
              pi = HeapAsync2.getParentIndexOf(i);
              return [4, this.compare(value, this.heapArray[pi])];
            case 2:
              if (_a.sent() < 0) {
                this.heapArray[i] = this.heapArray[pi];
                i = pi;
              } else
                return [3, 3];
              return [3, 1];
            case 3:
              if (i !== originalIndex) {
                this.heapArray[i] = value;
              }
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    HeapAsync2.prototype._topN_push = function(n) {
      return __awaiter(this, void 0, void 0, function() {
        var topHeap, indices, arr, i;
        return __generator$1(this, function(_a) {
          switch (_a.label) {
            case 0:
              topHeap = new HeapAsync2(this._invertedCompare);
              topHeap.limit = n;
              indices = [0];
              arr = this.heapArray;
              _a.label = 1;
            case 1:
              if (!indices.length) return [3, 7];
              i = indices.shift();
              if (!(i < arr.length)) return [3, 6];
              if (!(topHeap.length < n)) return [3, 3];
              return [4, topHeap.push(arr[i])];
            case 2:
              _a.sent();
              indices.push.apply(indices, __spreadArray$1([], __read$1(HeapAsync2.getChildrenIndexOf(i)), false));
              return [3, 6];
            case 3:
              return [4, this.compare(arr[i], topHeap.peek())];
            case 4:
              if (!(_a.sent() < 0)) return [3, 6];
              return [4, topHeap.replace(arr[i])];
            case 5:
              _a.sent();
              indices.push.apply(indices, __spreadArray$1([], __read$1(HeapAsync2.getChildrenIndexOf(i)), false));
              _a.label = 6;
            case 6:
              return [3, 1];
            case 7:
              return [2, topHeap.toArray()];
          }
        });
      });
    };
    HeapAsync2.prototype._topN_fill = function(n) {
      return __awaiter(this, void 0, void 0, function() {
        var heapArray, topHeap, branch, indices, i, i;
        return __generator$1(this, function(_a) {
          switch (_a.label) {
            case 0:
              heapArray = this.heapArray;
              topHeap = new HeapAsync2(this._invertedCompare);
              topHeap.limit = n;
              topHeap.heapArray = heapArray.slice(0, n);
              return [4, topHeap.init()];
            case 1:
              _a.sent();
              branch = HeapAsync2.getParentIndexOf(n - 1) + 1;
              indices = [];
              for (i = branch; i < n; ++i) {
                indices.push.apply(indices, __spreadArray$1([], __read$1(HeapAsync2.getChildrenIndexOf(i).filter(function(l) {
                  return l < heapArray.length;
                })), false));
              }
              if ((n - 1) % 2) {
                indices.push(n);
              }
              _a.label = 2;
            case 2:
              if (!indices.length) return [3, 6];
              i = indices.shift();
              if (!(i < heapArray.length)) return [3, 5];
              return [4, this.compare(heapArray[i], topHeap.peek())];
            case 3:
              if (!(_a.sent() < 0)) return [3, 5];
              return [4, topHeap.replace(heapArray[i])];
            case 4:
              _a.sent();
              indices.push.apply(indices, __spreadArray$1([], __read$1(HeapAsync2.getChildrenIndexOf(i)), false));
              _a.label = 5;
            case 5:
              return [3, 2];
            case 6:
              return [2, topHeap.toArray()];
          }
        });
      });
    };
    HeapAsync2.prototype._topN_heap = function(n) {
      return __awaiter(this, void 0, void 0, function() {
        var topHeap, result, i, _a, _b;
        return __generator$1(this, function(_c) {
          switch (_c.label) {
            case 0:
              topHeap = this.clone();
              result = [];
              i = 0;
              _c.label = 1;
            case 1:
              if (!(i < n)) return [3, 4];
              _b = (_a = result).push;
              return [4, topHeap.pop()];
            case 2:
              _b.apply(_a, [_c.sent()]);
              _c.label = 3;
            case 3:
              ++i;
              return [3, 1];
            case 4:
              return [2, result];
          }
        });
      });
    };
    HeapAsync2.prototype._topIdxOf = function(list) {
      return __awaiter(this, void 0, void 0, function() {
        var idx, top, i, comp;
        return __generator$1(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (!list.length) {
                return [2, -1];
              }
              idx = 0;
              top = list[idx];
              i = 1;
              _a.label = 1;
            case 1:
              if (!(i < list.length)) return [3, 4];
              return [4, this.compare(list[i], top)];
            case 2:
              comp = _a.sent();
              if (comp < 0) {
                idx = i;
                top = list[i];
              }
              _a.label = 3;
            case 3:
              ++i;
              return [3, 1];
            case 4:
              return [2, idx];
          }
        });
      });
    };
    HeapAsync2.prototype._topOf = function() {
      var list = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        list[_i] = arguments[_i];
      }
      return __awaiter(this, void 0, void 0, function() {
        var heap;
        return __generator$1(this, function(_a) {
          switch (_a.label) {
            case 0:
              heap = new HeapAsync2(this.compare);
              return [4, heap.init(list)];
            case 1:
              _a.sent();
              return [2, heap.peek()];
          }
        });
      });
    };
    return HeapAsync2;
  })()
);
var __generator = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var __read = function(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
};
var __spreadArray = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var Heap = (
  /** @class */
  (function() {
    function Heap2(compare) {
      if (compare === void 0) {
        compare = Heap2.minComparator;
      }
      var _this = this;
      this.compare = compare;
      this.heapArray = [];
      this._limit = 0;
      this.offer = this.add;
      this.element = this.peek;
      this.poll = this.pop;
      this.removeAll = this.clear;
      this._invertedCompare = function(a, b) {
        return -1 * _this.compare(a, b);
      };
    }
    Heap2.getChildrenIndexOf = function(idx) {
      return [idx * 2 + 1, idx * 2 + 2];
    };
    Heap2.getParentIndexOf = function(idx) {
      if (idx <= 0) {
        return -1;
      }
      return idx - 1 >> 1;
    };
    Heap2.getSiblingIndexOf = function(idx) {
      if (idx <= 0) {
        return -1;
      }
      var whichChildren = idx % 2 ? 1 : -1;
      return idx + whichChildren;
    };
    Heap2.minComparator = function(a, b) {
      if (a > b) {
        return 1;
      } else if (a < b) {
        return -1;
      } else {
        return 0;
      }
    };
    Heap2.maxComparator = function(a, b) {
      if (b > a) {
        return 1;
      } else if (b < a) {
        return -1;
      } else {
        return 0;
      }
    };
    Heap2.minComparatorNumber = function(a, b) {
      return a - b;
    };
    Heap2.maxComparatorNumber = function(a, b) {
      return b - a;
    };
    Heap2.defaultIsEqual = function(a, b) {
      return a === b;
    };
    Heap2.print = function(heap) {
      function deep(i2) {
        var pi = Heap2.getParentIndexOf(i2);
        return Math.floor(Math.log2(pi + 1));
      }
      function repeat(str, times) {
        var out = "";
        for (; times > 0; --times) {
          out += str;
        }
        return out;
      }
      var node = 0;
      var lines = [];
      var maxLines = deep(heap.length - 1) + 2;
      var maxLength = 0;
      while (node < heap.length) {
        var i = deep(node) + 1;
        if (node === 0) {
          i = 0;
        }
        var nodeText = String(heap.get(node));
        if (nodeText.length > maxLength) {
          maxLength = nodeText.length;
        }
        lines[i] = lines[i] || [];
        lines[i].push(nodeText);
        node += 1;
      }
      return lines.map(function(line, i2) {
        var times = Math.pow(2, maxLines - i2) - 1;
        return repeat(" ", Math.floor(times / 2) * maxLength) + line.map(function(el) {
          var half = (maxLength - el.length) / 2;
          return repeat(" ", Math.ceil(half)) + el + repeat(" ", Math.floor(half));
        }).join(repeat(" ", times * maxLength));
      }).join("\n");
    };
    Heap2.heapify = function(arr, compare) {
      var heap = new Heap2(compare);
      heap.heapArray = arr;
      heap.init();
      return heap;
    };
    Heap2.heappop = function(heapArr, compare) {
      var heap = new Heap2(compare);
      heap.heapArray = heapArr;
      return heap.pop();
    };
    Heap2.heappush = function(heapArr, item, compare) {
      var heap = new Heap2(compare);
      heap.heapArray = heapArr;
      heap.push(item);
    };
    Heap2.heappushpop = function(heapArr, item, compare) {
      var heap = new Heap2(compare);
      heap.heapArray = heapArr;
      return heap.pushpop(item);
    };
    Heap2.heapreplace = function(heapArr, item, compare) {
      var heap = new Heap2(compare);
      heap.heapArray = heapArr;
      return heap.replace(item);
    };
    Heap2.heaptop = function(heapArr, n, compare) {
      if (n === void 0) {
        n = 1;
      }
      var heap = new Heap2(compare);
      heap.heapArray = heapArr;
      return heap.top(n);
    };
    Heap2.heapbottom = function(heapArr, n, compare) {
      if (n === void 0) {
        n = 1;
      }
      var heap = new Heap2(compare);
      heap.heapArray = heapArr;
      return heap.bottom(n);
    };
    Heap2.nlargest = function(n, iterable, compare) {
      var heap = new Heap2(compare);
      heap.heapArray = __spreadArray([], __read(iterable), false);
      heap.init();
      return heap.top(n);
    };
    Heap2.nsmallest = function(n, iterable, compare) {
      var heap = new Heap2(compare);
      heap.heapArray = __spreadArray([], __read(iterable), false);
      heap.init();
      return heap.bottom(n);
    };
    Heap2.prototype.add = function(element) {
      this._sortNodeUp(this.heapArray.push(element) - 1);
      this._applyLimit();
      return true;
    };
    Heap2.prototype.addAll = function(elements) {
      var _a;
      var i = this.length;
      (_a = this.heapArray).push.apply(_a, __spreadArray([], __read(elements), false));
      for (var l = this.length; i < l; ++i) {
        this._sortNodeUp(i);
      }
      this._applyLimit();
      return true;
    };
    Heap2.prototype.bottom = function(n) {
      if (n === void 0) {
        n = 1;
      }
      if (this.heapArray.length === 0 || n <= 0) {
        return [];
      } else if (this.heapArray.length === 1) {
        return [this.heapArray[0]];
      } else if (n >= this.heapArray.length) {
        return __spreadArray([], __read(this.heapArray), false);
      } else {
        return this._bottomN_push(~~n);
      }
    };
    Heap2.prototype.check = function() {
      var _this = this;
      return this.heapArray.find(function(el, j) {
        return !!_this.getChildrenOf(j).find(function(ch) {
          return _this.compare(el, ch) > 0;
        });
      });
    };
    Heap2.prototype.clear = function() {
      this.heapArray = [];
    };
    Heap2.prototype.clone = function() {
      var cloned = new Heap2(this.comparator());
      cloned.heapArray = this.toArray();
      cloned._limit = this._limit;
      return cloned;
    };
    Heap2.prototype.comparator = function() {
      return this.compare;
    };
    Heap2.prototype.contains = function(o, callbackFn) {
      if (callbackFn === void 0) {
        callbackFn = Heap2.defaultIsEqual;
      }
      return this.indexOf(o, callbackFn) !== -1;
    };
    Heap2.prototype.init = function(array) {
      if (array) {
        this.heapArray = __spreadArray([], __read(array), false);
      }
      for (var i = Heap2.getParentIndexOf(this.length - 1); i >= 0; --i) {
        this._sortNodeDown(i);
      }
      this._applyLimit();
    };
    Heap2.prototype.isEmpty = function() {
      return this.length === 0;
    };
    Heap2.prototype.indexOf = function(element, callbackFn) {
      if (callbackFn === void 0) {
        callbackFn = Heap2.defaultIsEqual;
      }
      if (this.heapArray.length === 0) {
        return -1;
      }
      var indexes = [];
      var currentIndex = 0;
      while (currentIndex < this.heapArray.length) {
        var currentElement = this.heapArray[currentIndex];
        if (callbackFn(currentElement, element)) {
          return currentIndex;
        } else if (this.compare(currentElement, element) <= 0) {
          indexes.push.apply(indexes, __spreadArray([], __read(Heap2.getChildrenIndexOf(currentIndex)), false));
        }
        currentIndex = indexes.shift() || this.heapArray.length;
      }
      return -1;
    };
    Heap2.prototype.indexOfEvery = function(element, callbackFn) {
      if (callbackFn === void 0) {
        callbackFn = Heap2.defaultIsEqual;
      }
      if (this.heapArray.length === 0) {
        return [];
      }
      var indexes = [];
      var foundIndexes = [];
      var currentIndex = 0;
      while (currentIndex < this.heapArray.length) {
        var currentElement = this.heapArray[currentIndex];
        if (callbackFn(currentElement, element)) {
          foundIndexes.push(currentIndex);
          indexes.push.apply(indexes, __spreadArray([], __read(Heap2.getChildrenIndexOf(currentIndex)), false));
        } else if (this.compare(currentElement, element) <= 0) {
          indexes.push.apply(indexes, __spreadArray([], __read(Heap2.getChildrenIndexOf(currentIndex)), false));
        }
        currentIndex = indexes.shift() || this.heapArray.length;
      }
      return foundIndexes;
    };
    Heap2.prototype.leafs = function() {
      if (this.heapArray.length === 0) {
        return [];
      }
      var pi = Heap2.getParentIndexOf(this.heapArray.length - 1);
      return this.heapArray.slice(pi + 1);
    };
    Object.defineProperty(Heap2.prototype, "length", {
      /**
       * Length of the heap. Aliases: {@link size}.
       * @return {Number}
       * @see size
       */
      get: function() {
        return this.heapArray.length;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(Heap2.prototype, "limit", {
      /**
       * Get length limit of the heap.
       * Use {@link setLimit} or {@link limit} to set the limit.
       * @return {Number}
       * @see setLimit
       */
      get: function() {
        return this._limit;
      },
      /**
       * Set length limit of the heap. Same as using {@link setLimit}.
       * @description If the heap is longer than the limit, the needed amount of leafs are removed.
       * @param {Number} _l Limit, defaults to 0 (no limit). Negative, Infinity, or NaN values set the limit to 0.
       * @see setLimit
       */
      set: function(_l) {
        if (_l < 0 || isNaN(_l)) {
          this._limit = 0;
        } else {
          this._limit = ~~_l;
        }
        this._applyLimit();
      },
      enumerable: false,
      configurable: true
    });
    Heap2.prototype.setLimit = function(_l) {
      this.limit = _l;
      if (_l < 0 || isNaN(_l)) {
        return NaN;
      } else {
        return this._limit;
      }
    };
    Heap2.prototype.peek = function() {
      return this.heapArray[0];
    };
    Heap2.prototype.pop = function() {
      var last = this.heapArray.pop();
      if (this.length > 0 && last !== void 0) {
        return this.replace(last);
      }
      return last;
    };
    Heap2.prototype.push = function() {
      var elements = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        elements[_i] = arguments[_i];
      }
      if (elements.length < 1) {
        return false;
      } else if (elements.length === 1) {
        return this.add(elements[0]);
      } else {
        return this.addAll(elements);
      }
    };
    Heap2.prototype.pushpop = function(element) {
      var _a;
      if (this.compare(this.heapArray[0], element) < 0) {
        _a = __read([this.heapArray[0], element], 2), element = _a[0], this.heapArray[0] = _a[1];
        this._sortNodeDown(0);
      }
      return element;
    };
    Heap2.prototype.remove = function(o, callbackFn) {
      var _this = this;
      if (callbackFn === void 0) {
        callbackFn = Heap2.defaultIsEqual;
      }
      if (!this.heapArray.length)
        return false;
      if (o === void 0) {
        this.pop();
        return true;
      }
      var queue = [0];
      while (queue.length) {
        var idx = queue.shift();
        if (callbackFn(this.heapArray[idx], o)) {
          if (idx === 0) {
            this.pop();
          } else if (idx === this.heapArray.length - 1) {
            this.heapArray.pop();
          } else {
            this.heapArray.splice(idx, 1, this.heapArray.pop());
            this._sortNodeUp(idx);
            this._sortNodeDown(idx);
          }
          return true;
        } else if (this.compare(this.heapArray[idx], o) <= 0) {
          var children = Heap2.getChildrenIndexOf(idx).filter(function(c) {
            return c < _this.heapArray.length;
          });
          queue.push.apply(queue, __spreadArray([], __read(children), false));
        }
      }
      return false;
    };
    Heap2.prototype.replace = function(element) {
      var peek = this.heapArray[0];
      this.heapArray[0] = element;
      this._sortNodeDown(0);
      return peek;
    };
    Heap2.prototype.size = function() {
      return this.length;
    };
    Heap2.prototype.top = function(n) {
      if (n === void 0) {
        n = 1;
      }
      if (this.heapArray.length === 0 || n <= 0) {
        return [];
      } else if (this.heapArray.length === 1 || n === 1) {
        return [this.heapArray[0]];
      } else if (n >= this.heapArray.length) {
        return __spreadArray([], __read(this.heapArray), false);
      } else {
        return this._topN_push(~~n);
      }
    };
    Heap2.prototype.toArray = function() {
      return __spreadArray([], __read(this.heapArray), false);
    };
    Heap2.prototype.toString = function() {
      return this.heapArray.toString();
    };
    Heap2.prototype.get = function(i) {
      return this.heapArray[i];
    };
    Heap2.prototype.getChildrenOf = function(idx) {
      var _this = this;
      return Heap2.getChildrenIndexOf(idx).map(function(i) {
        return _this.heapArray[i];
      }).filter(function(e) {
        return e !== void 0;
      });
    };
    Heap2.prototype.getParentOf = function(idx) {
      var pi = Heap2.getParentIndexOf(idx);
      return this.heapArray[pi];
    };
    Heap2.prototype[Symbol.iterator] = function() {
      return __generator(this, function(_a) {
        switch (_a.label) {
          case 0:
            if (!this.length) return [3, 2];
            return [4, this.pop()];
          case 1:
            _a.sent();
            return [3, 0];
          case 2:
            return [
              2
              /*return*/
            ];
        }
      });
    };
    Heap2.prototype.iterator = function() {
      return this.toArray();
    };
    Heap2.prototype._applyLimit = function() {
      if (this._limit > 0 && this._limit < this.heapArray.length) {
        var rm = this.heapArray.length - this._limit;
        while (rm) {
          this.heapArray.pop();
          --rm;
        }
      }
    };
    Heap2.prototype._bottomN_push = function(n) {
      var bottomHeap = new Heap2(this.compare);
      bottomHeap.limit = n;
      bottomHeap.heapArray = this.heapArray.slice(-n);
      bottomHeap.init();
      var startAt = this.heapArray.length - 1 - n;
      var parentStartAt = Heap2.getParentIndexOf(startAt);
      var indices = [];
      for (var i = startAt; i > parentStartAt; --i) {
        indices.push(i);
      }
      var arr = this.heapArray;
      while (indices.length) {
        var i = indices.shift();
        if (this.compare(arr[i], bottomHeap.peek()) > 0) {
          bottomHeap.replace(arr[i]);
          if (i % 2) {
            indices.push(Heap2.getParentIndexOf(i));
          }
        }
      }
      return bottomHeap.toArray();
    };
    Heap2.prototype._moveNode = function(j, k) {
      var temp = this.heapArray[j];
      this.heapArray[j] = this.heapArray[k];
      this.heapArray[k] = temp;
    };
    Heap2.prototype._sortNodeDown = function(i) {
      var length = this.heapArray.length;
      var originalIndex = i;
      var value = this.heapArray[i];
      var left = 2 * i + 1;
      while (left < length) {
        var right = left + 1;
        var best = right >= length || this.compare(this.heapArray[left], this.heapArray[right]) < 0 ? left : right;
        if (this.compare(this.heapArray[best], value) < 0) {
          this.heapArray[i] = this.heapArray[best];
          i = best;
          left = 2 * i + 1;
        } else
          break;
      }
      if (i !== originalIndex) {
        this.heapArray[i] = value;
      }
    };
    Heap2.prototype._sortNodeUp = function(i) {
      var value = this.heapArray[i];
      var originalIndex = i;
      while (i > 0) {
        var pi = Heap2.getParentIndexOf(i);
        if (this.compare(value, this.heapArray[pi]) < 0) {
          this.heapArray[i] = this.heapArray[pi];
          i = pi;
        } else
          break;
      }
      if (i !== originalIndex) {
        this.heapArray[i] = value;
      }
    };
    Heap2.prototype._topN_push = function(n) {
      var topHeap = new Heap2(this._invertedCompare);
      topHeap.limit = n;
      var indices = [0];
      var arr = this.heapArray;
      while (indices.length) {
        var i = indices.shift();
        if (i < arr.length) {
          if (topHeap.length < n) {
            topHeap.push(arr[i]);
            indices.push.apply(indices, __spreadArray([], __read(Heap2.getChildrenIndexOf(i)), false));
          } else if (this.compare(arr[i], topHeap.peek()) < 0) {
            topHeap.replace(arr[i]);
            indices.push.apply(indices, __spreadArray([], __read(Heap2.getChildrenIndexOf(i)), false));
          }
        }
      }
      return topHeap.toArray();
    };
    Heap2.prototype._topN_fill = function(n) {
      var heapArray = this.heapArray;
      var topHeap = new Heap2(this._invertedCompare);
      topHeap.limit = n;
      topHeap.heapArray = heapArray.slice(0, n);
      topHeap.init();
      var branch = Heap2.getParentIndexOf(n - 1) + 1;
      var indices = [];
      for (var i = branch; i < n; ++i) {
        indices.push.apply(indices, __spreadArray([], __read(Heap2.getChildrenIndexOf(i).filter(function(l) {
          return l < heapArray.length;
        })), false));
      }
      if ((n - 1) % 2) {
        indices.push(n);
      }
      while (indices.length) {
        var i = indices.shift();
        if (i < heapArray.length) {
          if (this.compare(heapArray[i], topHeap.peek()) < 0) {
            topHeap.replace(heapArray[i]);
            indices.push.apply(indices, __spreadArray([], __read(Heap2.getChildrenIndexOf(i)), false));
          }
        }
      }
      return topHeap.toArray();
    };
    Heap2.prototype._topN_heap = function(n) {
      var topHeap = this.clone();
      var result = [];
      for (var i = 0; i < n; ++i) {
        result.push(topHeap.pop());
      }
      return result;
    };
    Heap2.prototype._topIdxOf = function(list) {
      if (!list.length) {
        return -1;
      }
      var idx = 0;
      var top = list[idx];
      for (var i = 1; i < list.length; ++i) {
        var comp = this.compare(list[i], top);
        if (comp < 0) {
          idx = i;
          top = list[i];
        }
      }
      return idx;
    };
    Heap2.prototype._topOf = function() {
      var list = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        list[_i] = arguments[_i];
      }
      var heap = new Heap2(this.compare);
      heap.init(list);
      return heap.peek();
    };
    return Heap2;
  })()
);

// node_modules/@mcap/core/dist/esm/CachedReadable.js
var CachedReadable = class {
  /**
   * The underlying source of the data to be cached.
   */
  #readable;
  /**
   * Cached data. Indexed by offset request and stored as a Uint8Array.
   * If the requested size is less than the cached data, the cached data is returned as a subarray.
   * If the requested size is greater than the cached data, the a new request is made to the underlying readable.
   */
  #cache = /* @__PURE__ */ new Map();
  /**
   * The maximum size of the cache in bytes.
   */
  #maxCacheSizeBytes;
  /**
   * The current size of the cache in bytes.
   */
  #currentCacheSizeBytes = 0;
  /**
   * The size of the underlying readable.
   */
  #size;
  constructor(readable, maxCacheSizeBytes) {
    this.#readable = readable;
    this.#maxCacheSizeBytes = maxCacheSizeBytes;
  }
  async size() {
    if (this.#size == void 0) {
      this.#size = await this.#readable.size();
    }
    return this.#size;
  }
  async read(offset, size, options) {
    const requestedSize = Number(size);
    const cached = this.#cache.get(offset);
    if (cached != void 0 && cached.byteLength >= requestedSize) {
      return cached.byteLength === requestedSize ? cached : cached.subarray(0, requestedSize);
    }
    const data = await this.#readable.read(offset, size, options);
    if (this.#currentCacheSizeBytes + data.byteLength <= this.#maxCacheSizeBytes) {
      const copy = new Uint8Array(data);
      this.#cache.set(offset, copy);
      this.#currentCacheSizeBytes += copy.byteLength;
      return copy;
    }
    return data;
  }
};

// node_modules/@mcap/core/dist/esm/getBigUint64.js
var getBigUint64 = typeof DataView.prototype.getBigUint64 === "function" ? DataView.prototype.getBigUint64 : function(offset, littleEndian) {
  const lo = littleEndian === true ? this.getUint32(offset, littleEndian) : this.getUint32(offset + 4, littleEndian);
  const hi = littleEndian === true ? this.getUint32(offset + 4, littleEndian) : this.getUint32(offset, littleEndian);
  return BigInt(hi) << 32n | BigInt(lo);
};

// node_modules/@mcap/core/dist/esm/McapByteReader.js
var textDecoder = new TextDecoder();
var McapByteReader = class {
  #view;
  #viewU8;
  /** Current read position in bytes from the start of the view. */
  offset;
  constructor(view, offset = 0) {
    this.#view = view;
    this.#viewU8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    this.offset = offset;
  }
  /**
   * Reinitialize the reader for a new view without allocating a new instance.
   *
   * Used internally to avoid allocation / GC overhead when the view changes.
   */
  reset(view, offset = 0) {
    this.#view = view;
    this.#viewU8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    this.offset = offset;
  }
  /** Number of unread bytes remaining in the view. */
  bytesRemaining() {
    return this.#viewU8.length - this.offset;
  }
  /** Read an unsigned 8-bit integer and advance the offset. */
  uint8() {
    const value = this.#view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }
  /** Read an unsigned 16-bit little-endian integer and advance the offset. */
  uint16() {
    const value = this.#view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }
  /** Read an unsigned 32-bit little-endian integer and advance the offset. */
  uint32() {
    const value = this.#view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }
  /** Read an unsigned 64-bit little-endian integer and advance the offset. */
  uint64() {
    const value = getBigUint64.call(this.#view, this.offset, true);
    this.offset += 8;
    return value;
  }
  /**
   * Read a length-prefixed UTF-8 string (uint32 length, then that many bytes) and advance the
   * offset.
   */
  string() {
    const length = this.uint32();
    if (length === 0) {
      return "";
    } else if (length > this.bytesRemaining()) {
      throw new Error(`String length ${length} exceeds bounds of buffer`);
    }
    return textDecoder.decode(this.u8ArrayBorrow(length));
  }
  /**
   * Read a length-prefixed sequence of key-value pairs (uint32 byte length of the entries, then
   * entries until that many bytes have been consumed).
   */
  keyValuePairs(readKey, readValue) {
    const length = this.uint32();
    if (this.offset + length > this.#view.byteLength) {
      throw new Error(`Key-value pairs length ${length} exceeds bounds of buffer`);
    }
    const result = [];
    const endOffset = this.offset + length;
    try {
      while (this.offset < endOffset) {
        result.push([readKey(this), readValue(this)]);
      }
    } catch (err2) {
      throw new Error(`Error reading key-value pairs: ${err2.message}`);
    }
    if (this.offset !== endOffset) {
      throw new Error(`Key-value pairs length (${this.offset - endOffset + length}) greater than expected (${length})`);
    }
    return result;
  }
  /**
   * Read a length-prefixed map (uint32 byte length of the entries, then key-value entries until
   * that many bytes have been consumed). Duplicate keys are an error.
   */
  map(readKey, readValue) {
    const length = this.uint32();
    if (this.offset + length > this.#view.byteLength) {
      throw new Error(`Map length ${length} exceeds bounds of buffer`);
    }
    const result = /* @__PURE__ */ new Map();
    const endOffset = this.offset + length;
    try {
      while (this.offset < endOffset) {
        const key = readKey(this);
        const value = readValue(this);
        const existingValue = result.get(key);
        if (existingValue != void 0) {
          throw new Error(`Duplicate key ${String(key)} (${String(existingValue)} vs ${String(value)})`);
        }
        result.set(key, value);
      }
    } catch (err2) {
      throw new Error(`Error reading map: ${err2.message}`);
    }
    if (this.offset !== endOffset) {
      throw new Error(`Map length (${this.offset - endOffset + length}) greater than expected (${length})`);
    }
    return result;
  }
  /**
   * Read `length` bytes as a view into the underlying buffer and advance the offset.
   *
   * The returned array shares memory with the source buffer. Do not use it after the source
   * buffer is reused or after the reader is reset. Use {@link u8ArrayCopy} when the data must
   * outlive the current parse.
   */
  u8ArrayBorrow(length) {
    if (!(length >= 0 && length <= this.bytesRemaining())) {
      throw new Error(`Byte array length ${length} exceeds bounds of buffer`);
    }
    const result = this.#viewU8.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }
  /**
   * Read `length` bytes as a copy of the underlying buffer and advance the offset.
   *
   * Unlike {@link u8ArrayBorrow}, the returned array does not share memory with the source buffer.
   */
  u8ArrayCopy(length) {
    if (!(length >= 0 && length <= this.bytesRemaining())) {
      throw new Error(`Byte array length ${length} exceeds bounds of buffer`);
    }
    const result = this.#viewU8.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }
};

// node_modules/@mcap/core/dist/esm/constants.js
var MCAP_MAGIC = Object.freeze([137, 77, 67, 65, 80, 48, 13, 10]);
var Opcode;
(function(Opcode2) {
  Opcode2[Opcode2["MIN"] = 1] = "MIN";
  Opcode2[Opcode2["HEADER"] = 1] = "HEADER";
  Opcode2[Opcode2["FOOTER"] = 2] = "FOOTER";
  Opcode2[Opcode2["SCHEMA"] = 3] = "SCHEMA";
  Opcode2[Opcode2["CHANNEL"] = 4] = "CHANNEL";
  Opcode2[Opcode2["MESSAGE"] = 5] = "MESSAGE";
  Opcode2[Opcode2["CHUNK"] = 6] = "CHUNK";
  Opcode2[Opcode2["MESSAGE_INDEX"] = 7] = "MESSAGE_INDEX";
  Opcode2[Opcode2["CHUNK_INDEX"] = 8] = "CHUNK_INDEX";
  Opcode2[Opcode2["ATTACHMENT"] = 9] = "ATTACHMENT";
  Opcode2[Opcode2["ATTACHMENT_INDEX"] = 10] = "ATTACHMENT_INDEX";
  Opcode2[Opcode2["STATISTICS"] = 11] = "STATISTICS";
  Opcode2[Opcode2["METADATA"] = 12] = "METADATA";
  Opcode2[Opcode2["METADATA_INDEX"] = 13] = "METADATA_INDEX";
  Opcode2[Opcode2["SUMMARY_OFFSET"] = 14] = "SUMMARY_OFFSET";
  Opcode2[Opcode2["DATA_END"] = 15] = "DATA_END";
  Opcode2[Opcode2["MAX"] = 15] = "MAX";
})(Opcode || (Opcode = {}));

// node_modules/@mcap/core/dist/esm/parse.js
function parseMagic(reader) {
  if (reader.bytesRemaining() < MCAP_MAGIC.length) {
    return void 0;
  }
  const magic = reader.u8ArrayBorrow(MCAP_MAGIC.length);
  if (!MCAP_MAGIC.every((val, i) => val === magic[i])) {
    throw new Error(`Expected MCAP magic '${MCAP_MAGIC.map((val) => val.toString(16).padStart(2, "0")).join(" ")}', found '${Array.from(magic, (_, i) => magic[i].toString(16).padStart(2, "0")).join(" ")}'`);
  }
  return { specVersion: "0" };
}
function parseRecord(reader, validateCrcs = false) {
  const RECORD_HEADER_SIZE = 1 + 8;
  if (reader.bytesRemaining() < RECORD_HEADER_SIZE) {
    return void 0;
  }
  const start = reader.offset;
  const opcode = reader.uint8();
  const recordLength = reader.uint64();
  if (recordLength > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Record content length ${recordLength} is too large`);
  }
  const recordLengthNum = Number(recordLength);
  if (reader.bytesRemaining() < recordLengthNum) {
    reader.offset = start;
    return void 0;
  }
  let result;
  switch (opcode) {
    case Opcode.HEADER:
      result = parseHeader(reader, recordLengthNum);
      break;
    case Opcode.FOOTER:
      result = parseFooter(reader, recordLengthNum);
      break;
    case Opcode.SCHEMA:
      result = parseSchema(reader, recordLengthNum);
      break;
    case Opcode.CHANNEL:
      result = parseChannel(reader, recordLengthNum);
      break;
    case Opcode.MESSAGE:
      result = parseMessage(reader, recordLengthNum);
      break;
    case Opcode.CHUNK:
      result = parseChunk(reader, recordLengthNum);
      break;
    case Opcode.MESSAGE_INDEX:
      result = parseMessageIndex(reader, recordLengthNum);
      break;
    case Opcode.CHUNK_INDEX:
      result = parseChunkIndex(reader, recordLengthNum);
      break;
    case Opcode.ATTACHMENT:
      result = parseAttachment(reader, recordLengthNum, validateCrcs);
      break;
    case Opcode.ATTACHMENT_INDEX:
      result = parseAttachmentIndex(reader, recordLengthNum);
      break;
    case Opcode.STATISTICS:
      result = parseStatistics(reader, recordLengthNum);
      break;
    case Opcode.METADATA:
      result = parseMetadata(reader, recordLengthNum);
      break;
    case Opcode.METADATA_INDEX:
      result = parseMetadataIndex(reader, recordLengthNum);
      break;
    case Opcode.SUMMARY_OFFSET:
      result = parseSummaryOffset(reader, recordLengthNum);
      break;
    case Opcode.DATA_END:
      result = parseDataEnd(reader, recordLengthNum);
      break;
    default:
      result = parseUnknown(reader, recordLengthNum, opcode);
      break;
  }
  reader.offset = start + RECORD_HEADER_SIZE + recordLengthNum;
  return result;
}
function parseUnknown(reader, recordLength, opcode) {
  const data = reader.u8ArrayBorrow(recordLength);
  return {
    type: "Unknown",
    opcode,
    data
  };
}
function parseHeader(reader, recordLength) {
  const startOffset = reader.offset;
  const profile = reader.string();
  const library = reader.string();
  reader.offset = startOffset + recordLength;
  return { type: "Header", profile, library };
}
function parseFooter(reader, recordLength) {
  const startOffset = reader.offset;
  const summaryStart = reader.uint64();
  const summaryOffsetStart = reader.uint64();
  const summaryCrc = reader.uint32();
  reader.offset = startOffset + recordLength;
  return {
    type: "Footer",
    summaryStart,
    summaryOffsetStart,
    summaryCrc
  };
}
function parseSchema(reader, recordLength) {
  const start = reader.offset;
  const id = reader.uint16();
  const name = reader.string();
  const encoding = reader.string();
  const dataLen = reader.uint32();
  const end = reader.offset;
  if (recordLength - (end - start) < dataLen) {
    throw new Error(`Schema data length ${dataLen} exceeds bounds of record`);
  }
  const data = reader.u8ArrayCopy(dataLen);
  reader.offset = start + recordLength;
  return {
    type: "Schema",
    id,
    encoding,
    name,
    data
  };
}
function parseChannel(reader, recordLength) {
  const startOffset = reader.offset;
  const channelId = reader.uint16();
  const schemaId = reader.uint16();
  const topicName = reader.string();
  const messageEncoding = reader.string();
  const metadata = reader.map((r) => r.string(), (r) => r.string());
  reader.offset = startOffset + recordLength;
  return {
    type: "Channel",
    id: channelId,
    schemaId,
    topic: topicName,
    messageEncoding,
    metadata
  };
}
function parseMessage(reader, recordLength) {
  const MESSAGE_PREFIX_SIZE = 2 + 4 + 8 + 8;
  if (recordLength < MESSAGE_PREFIX_SIZE) {
    throw new Error(`Message record length ${recordLength} is less than ${MESSAGE_PREFIX_SIZE} bytes`);
  }
  const channelId = reader.uint16();
  const sequence = reader.uint32();
  const logTime = reader.uint64();
  const publishTime = reader.uint64();
  const data = reader.u8ArrayCopy(recordLength - MESSAGE_PREFIX_SIZE);
  return {
    type: "Message",
    channelId,
    sequence,
    logTime,
    publishTime,
    data
  };
}
function parseChunk(reader, recordLength) {
  const start = reader.offset;
  const startTime = reader.uint64();
  const endTime = reader.uint64();
  const uncompressedSize = reader.uint64();
  const uncompressedCrc = reader.uint32();
  const compression = reader.string();
  const recordsByteLength = Number(reader.uint64());
  const end = reader.offset;
  const prefixSize = end - start;
  if (recordsByteLength + prefixSize > recordLength) {
    throw new Error("Chunk records length exceeds remaining record size");
  }
  const records = reader.u8ArrayCopy(recordsByteLength);
  reader.offset = start + recordLength;
  return {
    type: "Chunk",
    messageStartTime: startTime,
    messageEndTime: endTime,
    compression,
    uncompressedSize,
    uncompressedCrc,
    records
  };
}
function parseMessageIndex(reader, recordLength) {
  const startOffset = reader.offset;
  const channelId = reader.uint16();
  const records = reader.keyValuePairs((r) => r.uint64(), (r) => r.uint64());
  reader.offset = startOffset + recordLength;
  return {
    type: "MessageIndex",
    channelId,
    records
  };
}
function parseChunkIndex(reader, recordLength) {
  const startOffset = reader.offset;
  const messageStartTime = reader.uint64();
  const messageEndTime = reader.uint64();
  const chunkStartOffset = reader.uint64();
  const chunkLength = reader.uint64();
  const messageIndexOffsets = reader.map((r) => r.uint16(), (r) => r.uint64());
  const messageIndexLength = reader.uint64();
  const compression = reader.string();
  const compressedSize = reader.uint64();
  const uncompressedSize = reader.uint64();
  reader.offset = startOffset + recordLength;
  return {
    type: "ChunkIndex",
    messageStartTime,
    messageEndTime,
    chunkStartOffset,
    chunkLength,
    messageIndexOffsets,
    messageIndexLength,
    compression,
    compressedSize,
    uncompressedSize
  };
}
function parseAttachment(reader, recordLength, validateCrcs) {
  const startOffset = reader.offset;
  const logTime = reader.uint64();
  const createTime = reader.uint64();
  const name = reader.string();
  const mediaType = reader.string();
  const dataLen = reader.uint64();
  if (BigInt(reader.offset) + dataLen > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Attachment too large: ${dataLen}`);
  }
  if (reader.offset + Number(dataLen) + 4 > startOffset + recordLength) {
    throw new Error(`Attachment data length ${dataLen} exceeds bounds of record`);
  }
  const data = reader.u8ArrayCopy(Number(dataLen));
  const crcLength = reader.offset - startOffset;
  const expectedCrc = reader.uint32();
  if (validateCrcs && expectedCrc !== 0) {
    reader.offset = startOffset;
    const fullData = reader.u8ArrayBorrow(crcLength);
    const actualCrc = crc32(fullData);
    reader.offset = startOffset + crcLength + 4;
    if (actualCrc !== expectedCrc) {
      throw new Error(`Attachment CRC32 mismatch: expected ${expectedCrc}, actual ${actualCrc}`);
    }
  }
  reader.offset = startOffset + recordLength;
  return {
    type: "Attachment",
    logTime,
    createTime,
    name,
    mediaType,
    data
  };
}
function parseAttachmentIndex(reader, recordLength) {
  const startOffset = reader.offset;
  const offset = reader.uint64();
  const length = reader.uint64();
  const logTime = reader.uint64();
  const createTime = reader.uint64();
  const dataSize = reader.uint64();
  const name = reader.string();
  const mediaType = reader.string();
  reader.offset = startOffset + recordLength;
  return {
    type: "AttachmentIndex",
    offset,
    length,
    logTime,
    createTime,
    dataSize,
    name,
    mediaType
  };
}
function parseStatistics(reader, recordLength) {
  const startOffset = reader.offset;
  const messageCount = reader.uint64();
  const schemaCount = reader.uint16();
  const channelCount = reader.uint32();
  const attachmentCount = reader.uint32();
  const metadataCount = reader.uint32();
  const chunkCount = reader.uint32();
  const messageStartTime = reader.uint64();
  const messageEndTime = reader.uint64();
  const channelMessageCounts = reader.map((r) => r.uint16(), (r) => r.uint64());
  reader.offset = startOffset + recordLength;
  return {
    type: "Statistics",
    messageCount,
    schemaCount,
    channelCount,
    attachmentCount,
    metadataCount,
    chunkCount,
    messageStartTime,
    messageEndTime,
    channelMessageCounts
  };
}
function parseMetadata(reader, recordLength) {
  const startOffset = reader.offset;
  const name = reader.string();
  const metadata = reader.map((r) => r.string(), (r) => r.string());
  reader.offset = startOffset + recordLength;
  return { type: "Metadata", metadata, name };
}
function parseMetadataIndex(reader, recordLength) {
  const startOffset = reader.offset;
  const offset = reader.uint64();
  const length = reader.uint64();
  const name = reader.string();
  reader.offset = startOffset + recordLength;
  return {
    type: "MetadataIndex",
    offset,
    length,
    name
  };
}
function parseSummaryOffset(reader, recordLength) {
  const startOffset = reader.offset;
  const groupOpcode = reader.uint8();
  const groupStart = reader.uint64();
  const groupLength = reader.uint64();
  reader.offset = startOffset + recordLength;
  return {
    type: "SummaryOffset",
    groupOpcode,
    groupStart,
    groupLength
  };
}
function parseDataEnd(reader, recordLength) {
  const startOffset = reader.offset;
  const dataSectionCrc = reader.uint32();
  reader.offset = startOffset + recordLength;
  return {
    type: "DataEnd",
    dataSectionCrc
  };
}

// node_modules/@mcap/core/dist/esm/sortedIndexBy.js
function sortedIndexBy(array, value, iteratee) {
  let low = 0;
  let high = array.length;
  if (high === 0) {
    return 0;
  }
  const computedValue = iteratee(value);
  while (low < high) {
    const mid = low + high >>> 1;
    const curComputedValue = iteratee(array[mid][0]);
    if (curComputedValue < computedValue) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return high;
}

// node_modules/@mcap/core/dist/esm/sortedLastIndex.js
function sortedLastIndexBy(array, value, iteratee) {
  let low = 0;
  let high = array.length;
  if (high === 0) {
    return 0;
  }
  const computedValue = iteratee(value);
  while (low < high) {
    const mid = low + high >>> 1;
    const computed = iteratee(array[mid][0]);
    if (computed <= computedValue) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return high;
}

// node_modules/@mcap/core/dist/esm/ChunkCursor.js
var ChunkCursor = class {
  chunkIndex;
  #relevantChannels;
  #startTime;
  #endTime;
  #reverse;
  #readFullMessageIndexRange;
  // List of message offsets (across all channels) sorted by logTime.
  #orderedMessageOffsets;
  // Index for the next message offset. Gets incremented for every popMessage() call.
  #nextMessageOffsetIndex = 0;
  constructor(params) {
    this.chunkIndex = params.chunkIndex;
    this.#relevantChannels = params.relevantChannels;
    this.#startTime = params.startTime;
    this.#endTime = params.endTime;
    this.#reverse = params.reverse;
    this.#readFullMessageIndexRange = params.readFullMessageIndexRange ?? false;
    if (this.chunkIndex.messageIndexLength === 0n) {
      if (this.chunkIndex.messageStartTime !== 0n || this.chunkIndex.messageEndTime !== 0n) {
        throw new Error(`Encountered a chunk index without message indexes and non-zero start and end times`);
      }
    }
  }
  /**
   * Returns `< 0` if the callee's next available message logTime is earlier than `other`'s, `> 0`
   * for the opposite case. Never returns `0` because ties are broken by the chunks' offsets in the
   * file.
   *
   * Cursors that still need `loadMessageIndexes()` are sorted earlier so the caller can load them
   * and re-sort the cursors.
   */
  compare(other) {
    if (this.#reverse !== other.#reverse) {
      throw new Error("Cannot compare a reversed ChunkCursor to a non-reversed ChunkCursor");
    }
    let diff = Number(this.#getSortTime() - other.#getSortTime());
    if (diff === 0) {
      diff = Number(this.chunkIndex.chunkStartOffset - other.chunkIndex.chunkStartOffset);
    }
    return this.#reverse ? -diff : diff;
  }
  /**
   * Returns true if there are more messages available in the chunk. Message indexes must have been
   * loaded before using this method.
   */
  hasMoreMessages() {
    if (this.#orderedMessageOffsets == void 0) {
      throw new Error("loadMessageIndexes() must be called before hasMore()");
    }
    return this.#nextMessageOffsetIndex < this.#orderedMessageOffsets.length;
  }
  /**
   * Pop a message offset off of the chunk cursor. Message indexes must have been loaded before
   * using this method.
   */
  popMessage() {
    if (this.#orderedMessageOffsets == void 0) {
      throw new Error("loadMessageIndexes() must be called before popMessage()");
    }
    if (this.#nextMessageOffsetIndex >= this.#orderedMessageOffsets.length) {
      throw new Error(`Unexpected popMessage() call when no more messages are available, in chunk at offset ${this.chunkIndex.chunkStartOffset}`);
    }
    return this.#orderedMessageOffsets[this.#nextMessageOffsetIndex++];
  }
  /**
   * Returns true if message indexes have been loaded, false if `loadMessageIndexes()` needs to be
   * called.
   */
  hasMessageIndexes() {
    return this.#orderedMessageOffsets != void 0;
  }
  async loadMessageIndexes(readable, readOptions) {
    const reverse = this.#reverse;
    let messageIndexStartOffset;
    let relevantMessageIndexStartOffset;
    const readFullRange = this.#readFullMessageIndexRange;
    for (const [channelId, offset] of this.chunkIndex.messageIndexOffsets) {
      if (messageIndexStartOffset == void 0 || offset < messageIndexStartOffset) {
        messageIndexStartOffset = offset;
      }
      if (readFullRange || !this.#relevantChannels || this.#relevantChannels.has(channelId)) {
        if (relevantMessageIndexStartOffset == void 0 || offset < relevantMessageIndexStartOffset) {
          relevantMessageIndexStartOffset = offset;
        }
      }
    }
    if (messageIndexStartOffset == void 0 || relevantMessageIndexStartOffset == void 0) {
      this.#orderedMessageOffsets = [];
      return;
    }
    const messageIndexEndOffset = messageIndexStartOffset + this.chunkIndex.messageIndexLength;
    const messageIndexes = await readable.read(relevantMessageIndexStartOffset, messageIndexEndOffset - relevantMessageIndexStartOffset, readOptions);
    const messageIndexesView = new DataView(messageIndexes.buffer, messageIndexes.byteOffset, messageIndexes.byteLength);
    const reader = new McapByteReader(messageIndexesView);
    const arrayOfMessageOffsets = [];
    let record;
    while (record = parseRecord(reader, true)) {
      if (record.type !== "MessageIndex") {
        continue;
      }
      if (record.records.length === 0 || this.#relevantChannels && !this.#relevantChannels.has(record.channelId)) {
        continue;
      }
      arrayOfMessageOffsets.push(record.records);
    }
    if (reader.bytesRemaining() !== 0) {
      throw new Error(`${reader.bytesRemaining()} bytes remaining in message index section`);
    }
    this.#orderedMessageOffsets = arrayOfMessageOffsets.flat().sort(([logTimeA, offsetA], [logTimeB, offsetB]) => {
      let diff = Number(logTimeA - logTimeB);
      if (diff === 0) {
        diff = Number(offsetA - offsetB);
      }
      return diff;
    });
    if (reverse) {
      this.#orderedMessageOffsets.reverse();
    }
    if (this.#orderedMessageOffsets.length === 0) {
      return;
    }
    const [logTimeFirstMessage] = this.#orderedMessageOffsets[0];
    if (logTimeFirstMessage < this.chunkIndex.messageStartTime) {
      throw new Error(`Chunk at offset ${this.chunkIndex.chunkStartOffset} contains a message with logTime (${logTimeFirstMessage}) earlier than chunk messageStartTime (${this.chunkIndex.messageStartTime})`);
    }
    const [logTimeLastMessage] = this.#orderedMessageOffsets[this.#orderedMessageOffsets.length - 1];
    if (logTimeLastMessage > this.chunkIndex.messageEndTime) {
      throw new Error(`Chunk at offset ${this.chunkIndex.chunkStartOffset} contains a message with logTime (${logTimeLastMessage}) later than chunk messageEndTime (${this.chunkIndex.messageEndTime})`);
    }
    const startTime = reverse ? this.#endTime : this.#startTime;
    const endTime = reverse ? this.#startTime : this.#endTime;
    const iteratee = reverse ? (logTime) => -logTime : (logTime) => logTime;
    let startIndex;
    let endIndex;
    if (startTime != void 0) {
      startIndex = sortedIndexBy(this.#orderedMessageOffsets, startTime, iteratee);
    }
    if (endTime != void 0) {
      endIndex = sortedLastIndexBy(this.#orderedMessageOffsets, endTime, iteratee);
    }
    if (startIndex != void 0 || endIndex != void 0) {
      this.#orderedMessageOffsets = this.#orderedMessageOffsets.slice(startIndex, endIndex);
    }
  }
  // Get the next available message logTime which is being used when comparing chunkCursors (for ordering purposes).
  #getSortTime() {
    if (this.#orderedMessageOffsets != void 0 && this.#orderedMessageOffsets.length > 0 && this.#nextMessageOffsetIndex < this.#orderedMessageOffsets.length) {
      return this.#orderedMessageOffsets[this.#nextMessageOffsetIndex][0];
    }
    return this.#reverse ? this.chunkIndex.messageEndTime : this.chunkIndex.messageStartTime;
  }
};

// node_modules/@mcap/core/dist/esm/McapIndexedReader.js
var McapIndexedReader = class _McapIndexedReader {
  chunkIndexes;
  attachmentIndexes;
  metadataIndexes = [];
  channelsById;
  schemasById;
  statistics;
  summaryOffsetsByOpcode;
  header;
  footer;
  // Used for appending attachments/metadata to existing MCAP files
  dataEndOffset;
  dataSectionCrc;
  #readable;
  #messageIndexReadable;
  #decompressHandlers;
  #messageStartTime;
  #messageEndTime;
  #attachmentStartTime;
  #attachmentEndTime;
  constructor(args) {
    this.#readable = args.readable;
    this.chunkIndexes = args.chunkIndexes;
    this.attachmentIndexes = args.attachmentIndexes;
    this.metadataIndexes = args.metadataIndexes;
    this.statistics = args.statistics;
    this.#decompressHandlers = args.decompressHandlers;
    this.channelsById = args.channelsById;
    this.schemasById = args.schemasById;
    this.summaryOffsetsByOpcode = args.summaryOffsetsByOpcode;
    this.header = args.header;
    this.footer = args.footer;
    this.dataEndOffset = args.dataEndOffset;
    this.dataSectionCrc = args.dataSectionCrc;
    const messageIndexCacheSizeBytes = args.messageIndexCacheSizeBytes ?? 0;
    this.#messageIndexReadable = messageIndexCacheSizeBytes > 0 ? new CachedReadable(this.#readable, messageIndexCacheSizeBytes) : this.#readable;
    for (const chunk of args.chunkIndexes) {
      if (this.#messageStartTime == void 0 || chunk.messageStartTime < this.#messageStartTime) {
        this.#messageStartTime = chunk.messageStartTime;
      }
      if (this.#messageEndTime == void 0 || chunk.messageEndTime > this.#messageEndTime) {
        this.#messageEndTime = chunk.messageEndTime;
      }
    }
    for (const attachment of args.attachmentIndexes) {
      if (this.#attachmentStartTime == void 0 || attachment.logTime < this.#attachmentStartTime) {
        this.#attachmentStartTime = attachment.logTime;
      }
      if (this.#attachmentEndTime == void 0 || attachment.logTime > this.#attachmentEndTime) {
        this.#attachmentEndTime = attachment.logTime;
      }
    }
  }
  #errorWithLibrary(message) {
    return new Error(`${message} [library=${this.header.library}]`);
  }
  static async Initialize({ readable, decompressHandlers, messageIndexCacheSizeBytes, readOptions }) {
    const size = await readable.size();
    let header;
    let headerEndOffset;
    {
      const headerPrefix = await readable.read(0n, BigInt(MCAP_MAGIC.length + /* Opcode.HEADER */
      1 + /* record content length */
      8), readOptions);
      const headerPrefixView = new DataView(headerPrefix.buffer, headerPrefix.byteOffset, headerPrefix.byteLength);
      void parseMagic(new McapByteReader(headerPrefixView));
      const headerContentLength = headerPrefixView.getBigUint64(MCAP_MAGIC.length + /* Opcode.HEADER */
      1, true);
      const headerReadLength = (
        /* Opcode.HEADER */
        1n + /* record content length */
        8n + headerContentLength
      );
      const headerRecord = await readable.read(BigInt(MCAP_MAGIC.length), headerReadLength, readOptions);
      headerEndOffset = BigInt(MCAP_MAGIC.length) + headerReadLength;
      const headerReader = new McapByteReader(new DataView(headerRecord.buffer, headerRecord.byteOffset, headerRecord.byteLength));
      const headerResult = parseRecord(headerReader, true);
      if (headerResult?.type !== "Header") {
        throw new Error(`Unable to read header at beginning of file; found ${headerResult?.type ?? "nothing"}`);
      }
      if (headerReader.bytesRemaining() !== 0) {
        throw new Error(`${headerReader.bytesRemaining()} bytes remaining after parsing header`);
      }
      header = headerResult;
    }
    function errorWithLibrary(message) {
      return new Error(`${message} [library=${header.library}]`);
    }
    let footerOffset;
    let footerAndMagicView;
    {
      const headerLengthLowerBound = BigInt(MCAP_MAGIC.length + /* Opcode.HEADER */
      1 + /* record content length */
      8 + /* profile length */
      4 + /* library length */
      4);
      const footerAndMagicReadLength = BigInt(
        /* Opcode.FOOTER */
        1 + /* record content length */
        8 + /* summaryStart */
        8 + /* summaryOffsetStart */
        8 + /* crc */
        4 + MCAP_MAGIC.length
      );
      if (size < headerLengthLowerBound + footerAndMagicReadLength) {
        throw errorWithLibrary(`File size (${size}) is too small to be valid MCAP`);
      }
      footerOffset = size - footerAndMagicReadLength;
      const footerBuffer = await readable.read(footerOffset, footerAndMagicReadLength, readOptions);
      footerAndMagicView = new DataView(footerBuffer.buffer, footerBuffer.byteOffset, footerBuffer.byteLength);
    }
    try {
      void parseMagic(new McapByteReader(footerAndMagicView, footerAndMagicView.byteLength - MCAP_MAGIC.length));
    } catch (error) {
      throw errorWithLibrary(error.message);
    }
    let footer;
    {
      const footerReader = new McapByteReader(footerAndMagicView);
      const footerRecord = parseRecord(footerReader, true);
      if (footerRecord?.type !== "Footer") {
        throw errorWithLibrary(`Unable to read footer from end of file (offset ${footerOffset}); found ${footerRecord?.type ?? "nothing"}`);
      }
      if (footerReader.bytesRemaining() !== MCAP_MAGIC.length) {
        throw errorWithLibrary(`${footerReader.bytesRemaining() - MCAP_MAGIC.length} bytes remaining after parsing footer`);
      }
      footer = footerRecord;
    }
    if (footer.summaryStart === 0n) {
      throw errorWithLibrary("File is not indexed");
    }
    const footerPrefix = new Uint8Array(
      /* Opcode.FOOTER */
      1 + /* record content length */
      8 + /* summary start */
      8 + /* summary offset start */
      8
    );
    footerPrefix.set(new Uint8Array(footerAndMagicView.buffer, footerAndMagicView.byteOffset, footerPrefix.byteLength));
    const dataEndLength = (
      /* Opcode.DATA_END */
      1n + /* record content length */
      8n + /* data_section_crc */
      4n
    );
    const dataEndOffset = footer.summaryStart - dataEndLength;
    if (dataEndOffset < headerEndOffset) {
      throw errorWithLibrary(`Expected DataEnd position (summary start ${footer.summaryStart} - ${dataEndLength} = ${dataEndOffset}) to be after Header end offset (${headerEndOffset})`);
    }
    const dataEndAndSummarySection = await readable.read(dataEndOffset, footerOffset - dataEndOffset, readOptions);
    if (footer.summaryCrc !== 0) {
      let summaryCrc = crc32Init();
      summaryCrc = crc32Update(summaryCrc, dataEndAndSummarySection.subarray(Number(dataEndLength)));
      summaryCrc = crc32Update(summaryCrc, footerPrefix);
      summaryCrc = crc32Final(summaryCrc);
      if (summaryCrc !== footer.summaryCrc) {
        throw errorWithLibrary(`Incorrect summary CRC ${summaryCrc} (expected ${footer.summaryCrc})`);
      }
    }
    const indexView = new DataView(dataEndAndSummarySection.buffer, dataEndAndSummarySection.byteOffset, dataEndAndSummarySection.byteLength);
    const indexReader = new McapByteReader(indexView);
    const channelsById = /* @__PURE__ */ new Map();
    const schemasById = /* @__PURE__ */ new Map();
    const chunkIndexes = [];
    const attachmentIndexes = [];
    const metadataIndexes = [];
    const summaryOffsetsByOpcode = /* @__PURE__ */ new Map();
    let statistics;
    let dataSectionCrc;
    let first = true;
    let result;
    while (result = parseRecord(indexReader, true)) {
      if (first && result.type !== "DataEnd") {
        throw errorWithLibrary(`Expected DataEnd record to precede summary section, but found ${result.type}`);
      }
      first = false;
      switch (result.type) {
        case "Schema":
          schemasById.set(result.id, result);
          break;
        case "Channel":
          channelsById.set(result.id, result);
          break;
        case "ChunkIndex":
          chunkIndexes.push(result);
          break;
        case "AttachmentIndex":
          attachmentIndexes.push(result);
          break;
        case "MetadataIndex":
          metadataIndexes.push(result);
          break;
        case "Statistics":
          if (statistics) {
            throw errorWithLibrary("Duplicate Statistics record");
          }
          statistics = result;
          break;
        case "SummaryOffset":
          summaryOffsetsByOpcode.set(result.groupOpcode, result);
          break;
        case "DataEnd":
          dataSectionCrc = result.dataSectionCrc === 0 ? void 0 : result.dataSectionCrc;
          break;
        case "Header":
        case "Footer":
        case "Message":
        case "Chunk":
        case "MessageIndex":
        case "Attachment":
        case "Metadata":
          throw errorWithLibrary(`${result.type} record not allowed in index section`);
        case "Unknown":
          break;
      }
    }
    if (indexReader.bytesRemaining() !== 0) {
      throw errorWithLibrary(`${indexReader.bytesRemaining()} bytes remaining in index section`);
    }
    return new _McapIndexedReader({
      readable,
      chunkIndexes,
      attachmentIndexes,
      metadataIndexes,
      statistics,
      decompressHandlers,
      channelsById,
      schemasById,
      summaryOffsetsByOpcode,
      header,
      footer,
      dataEndOffset,
      dataSectionCrc,
      messageIndexCacheSizeBytes
    });
  }
  async *readMessages(args = {}) {
    const { topics, startTime = this.#messageStartTime, endTime = this.#messageEndTime, reverse = false, validateCrcs, readOptions } = args;
    if (startTime == void 0 || endTime == void 0) {
      return;
    }
    let relevantChannels;
    if (topics) {
      relevantChannels = /* @__PURE__ */ new Set();
      for (const channel of this.channelsById.values()) {
        if (topics.includes(channel.topic)) {
          relevantChannels.add(channel.id);
        }
      }
    }
    const chunkCursors = new Heap((a, b) => a.compare(b));
    let chunksOrdered = true;
    let prevChunkEndTime;
    const readFullMessageIndexRange = this.#messageIndexReadable !== this.#readable;
    for (const chunkIndex of this.chunkIndexes) {
      if (chunkIndex.messageStartTime <= endTime && chunkIndex.messageEndTime >= startTime) {
        chunkCursors.push(new ChunkCursor({
          chunkIndex,
          relevantChannels,
          startTime,
          endTime,
          reverse,
          readFullMessageIndexRange
        }));
        if (chunksOrdered && prevChunkEndTime != void 0) {
          chunksOrdered = chunkIndex.messageStartTime >= prevChunkEndTime;
        }
        prevChunkEndTime = chunkIndex.messageEndTime;
      }
    }
    const chunkViewCache = /* @__PURE__ */ new Map();
    const chunkReader = new McapByteReader(new DataView(new ArrayBuffer(0)));
    for (let cursor; cursor = chunkCursors.peek(); ) {
      if (!cursor.hasMessageIndexes()) {
        await cursor.loadMessageIndexes(this.#messageIndexReadable, readOptions);
        if (cursor.hasMoreMessages()) {
          chunkCursors.replace(cursor);
        } else {
          chunkCursors.pop();
        }
        continue;
      }
      let chunkView = chunkViewCache.get(cursor.chunkIndex.chunkStartOffset);
      if (!chunkView) {
        chunkView = await this.#loadChunkData(cursor.chunkIndex, {
          validateCrcs: validateCrcs ?? true,
          readOptions
        });
        chunkViewCache.set(cursor.chunkIndex.chunkStartOffset, chunkView);
      }
      const [logTime, offset] = cursor.popMessage();
      if (offset >= BigInt(chunkView.byteLength)) {
        throw this.#errorWithLibrary(`Message offset beyond chunk bounds (log time ${logTime}, offset ${offset}, chunk data length ${chunkView.byteLength}) in chunk at offset ${cursor.chunkIndex.chunkStartOffset}`);
      }
      chunkReader.reset(chunkView, Number(offset));
      const record = parseRecord(chunkReader, validateCrcs ?? true);
      if (!record) {
        throw this.#errorWithLibrary(`Unable to parse record at offset ${offset} in chunk at offset ${cursor.chunkIndex.chunkStartOffset}`);
      }
      if (record.type !== "Message") {
        throw this.#errorWithLibrary(`Unexpected record type ${record.type} in message index (time ${logTime}, offset ${offset} in chunk at offset ${cursor.chunkIndex.chunkStartOffset})`);
      }
      if (record.logTime !== logTime) {
        throw this.#errorWithLibrary(`Message log time ${record.logTime} did not match message index entry (${logTime} at offset ${offset} in chunk at offset ${cursor.chunkIndex.chunkStartOffset})`);
      }
      yield record;
      if (cursor.hasMoreMessages()) {
        if (!chunksOrdered) {
          chunkCursors.replace(cursor);
        }
      } else {
        chunkCursors.pop();
        chunkViewCache.delete(cursor.chunkIndex.chunkStartOffset);
      }
    }
  }
  async *readMetadata(args = {}) {
    const { name, readOptions } = args;
    for (const metadataIndex of this.metadataIndexes) {
      if (name != void 0 && metadataIndex.name !== name) {
        continue;
      }
      const metadataData = await this.#readable.read(metadataIndex.offset, metadataIndex.length, readOptions);
      const metadataReader = new McapByteReader(new DataView(metadataData.buffer, metadataData.byteOffset, metadataData.byteLength));
      const metadataRecord = parseRecord(metadataReader, false);
      if (metadataRecord?.type !== "Metadata") {
        throw this.#errorWithLibrary(`Metadata data at offset ${metadataIndex.offset} does not point to metadata record (found ${String(metadataRecord?.type)})`);
      }
      yield metadataRecord;
    }
  }
  async *readAttachments(args = {}) {
    const { name, mediaType, startTime = this.#attachmentStartTime, endTime = this.#attachmentEndTime, validateCrcs, readOptions } = args;
    if (startTime == void 0 || endTime == void 0) {
      return;
    }
    for (const attachmentIndex of this.attachmentIndexes) {
      if (name != void 0 && attachmentIndex.name !== name) {
        continue;
      }
      if (mediaType != void 0 && attachmentIndex.mediaType !== mediaType) {
        continue;
      }
      if (attachmentIndex.logTime > endTime || attachmentIndex.logTime < startTime) {
        continue;
      }
      const attachmentData = await this.#readable.read(attachmentIndex.offset, attachmentIndex.length, readOptions);
      const attachmentReader = new McapByteReader(new DataView(attachmentData.buffer, attachmentData.byteOffset, attachmentData.byteLength));
      const attachmentRecord = parseRecord(attachmentReader, validateCrcs ?? true);
      if (attachmentRecord?.type !== "Attachment") {
        throw this.#errorWithLibrary(`Attachment data at offset ${attachmentIndex.offset} does not point to attachment record (found ${String(attachmentRecord?.type)})`);
      }
      yield attachmentRecord;
    }
  }
  async #loadChunkData(chunkIndex, options) {
    const chunkData = await this.#readable.read(chunkIndex.chunkStartOffset, chunkIndex.chunkLength, options?.readOptions);
    const chunkReader = new McapByteReader(new DataView(chunkData.buffer, chunkData.byteOffset, chunkData.byteLength));
    const chunkRecord = parseRecord(chunkReader, options?.validateCrcs ?? true);
    if (chunkRecord?.type !== "Chunk") {
      throw this.#errorWithLibrary(`Chunk start offset ${chunkIndex.chunkStartOffset} does not point to chunk record (found ${String(chunkRecord?.type)})`);
    }
    const chunk = chunkRecord;
    let buffer = chunk.records;
    if (chunk.compression !== "" && buffer.byteLength > 0) {
      const decompress2 = this.#decompressHandlers?.[chunk.compression];
      if (!decompress2) {
        throw this.#errorWithLibrary(`Unsupported compression ${chunk.compression}`);
      }
      buffer = decompress2(buffer, chunk.uncompressedSize);
    }
    if (chunk.uncompressedCrc !== 0 && options?.validateCrcs !== false) {
      const chunkCrc = crc32(buffer);
      if (chunkCrc !== chunk.uncompressedCrc) {
        throw this.#errorWithLibrary(`Incorrect chunk CRC ${chunkCrc} (expected ${chunk.uncompressedCrc})`);
      }
    }
    return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
};

// node_modules/@mcap/core/dist/esm/McapStreamReader.js
var McapStreamReader = class {
  #buffer = new ArrayBuffer(MCAP_MAGIC.length * 2);
  #view = new DataView(this.#buffer, 0, 0);
  #reader = new McapByteReader(this.#view);
  #decompressHandlers;
  #includeChunks;
  #emitChunks;
  #validateCrcs;
  #noMagicPrefix;
  #doneReading = false;
  #generator = this.#read();
  #channelsById = /* @__PURE__ */ new Map();
  constructor({ includeChunks = false, emitChunks = false, decompressHandlers = {}, validateCrcs = true, noMagicPrefix = false } = {}) {
    this.#includeChunks = includeChunks;
    this.#emitChunks = emitChunks;
    this.#decompressHandlers = decompressHandlers;
    this.#validateCrcs = validateCrcs;
    this.#noMagicPrefix = noMagicPrefix;
  }
  /** @returns True if a valid, complete mcap file has been parsed. */
  done() {
    return this.#doneReading;
  }
  /** @returns The number of bytes that have been received by `append()` but not yet parsed. */
  bytesRemaining() {
    return this.#reader.bytesRemaining();
  }
  /**
   * Provide the reader with newly received bytes for it to process. After calling this function,
   * call `nextRecord()` again to parse any records that are now available.
   */
  append(data) {
    if (this.#doneReading) {
      throw new Error("Already done reading");
    }
    this.#appendOrShift(data);
  }
  #appendOrShift(data) {
    const consumedBytes = this.#reader.offset;
    const unconsumedBytes = this.#view.byteLength - consumedBytes;
    const neededCapacity = unconsumedBytes + data.byteLength;
    if (neededCapacity <= this.#buffer.byteLength) {
      if (this.#view.byteOffset + this.#view.byteLength + data.byteLength <= this.#buffer.byteLength) {
        const array = new Uint8Array(this.#buffer, this.#view.byteOffset);
        array.set(data, this.#view.byteLength);
        this.#view = new DataView(this.#buffer, this.#view.byteOffset, this.#view.byteLength + data.byteLength);
        this.#reader.reset(this.#view, this.#reader.offset);
      } else {
        const existingData = new Uint8Array(this.#buffer, this.#view.byteOffset + consumedBytes, unconsumedBytes);
        const array = new Uint8Array(this.#buffer);
        array.set(existingData, 0);
        array.set(data, existingData.byteLength);
        this.#view = new DataView(this.#buffer, 0, existingData.byteLength + data.byteLength);
        this.#reader.reset(this.#view);
      }
    } else {
      this.#buffer = new ArrayBuffer(neededCapacity * 2);
      const array = new Uint8Array(this.#buffer);
      const existingData = new Uint8Array(this.#view.buffer, this.#view.byteOffset + consumedBytes, unconsumedBytes);
      array.set(existingData, 0);
      array.set(data, existingData.byteLength);
      this.#view = new DataView(this.#buffer, 0, existingData.byteLength + data.byteLength);
      this.#reader.reset(this.#view);
    }
  }
  /**
   * Read the next record from the stream if possible. If not enough data is available to parse a
   * complete record, or if the reading has terminated with a valid footer, returns undefined.
   *
   * This function may throw any errors encountered during parsing. If an error is thrown, the
   * reader is in an unspecified state and should no longer be used.
   */
  nextRecord() {
    if (this.#doneReading) {
      return void 0;
    }
    const result = this.#generator.next();
    if (result.value?.type === "Channel") {
      const existing = this.#channelsById.get(result.value.id);
      this.#channelsById.set(result.value.id, result.value);
      if (existing && !isChannelEqual(existing, result.value)) {
        throw new Error(`Channel record for id ${result.value.id} (topic: ${result.value.topic}) differs from previous channel record of the same id.`);
      }
    } else if (!this.#emitChunks && result.value?.type === "Message") {
      const channelId = result.value.channelId;
      const existing = this.#channelsById.get(channelId);
      if (!existing) {
        throw new Error(`Encountered message on channel ${channelId} without prior channel record`);
      }
    }
    if (result.done === true) {
      this.#doneReading = true;
    }
    return result.value;
  }
  *#read() {
    if (!this.#noMagicPrefix) {
      let magic;
      while (magic = parseMagic(this.#reader), !magic) {
        yield;
      }
    }
    let header;
    function errorWithLibrary(message) {
      return new Error(`${message} ${header ? `[library=${header.library}]` : "[no header]"}`);
    }
    for (; ; ) {
      let record;
      while (record = parseRecord(this.#reader, this.#validateCrcs), !record) {
        yield;
      }
      switch (record.type) {
        case "Header":
          if (header) {
            throw new Error(`Duplicate Header record: library=${header.library} profile=${header.profile} vs. library=${record.library} profile=${record.profile}`);
          }
          header = record;
          yield record;
          break;
        case "Unknown":
        case "Schema":
        case "Channel":
        case "Message":
        case "MessageIndex":
        case "ChunkIndex":
        case "Attachment":
        case "AttachmentIndex":
        case "Statistics":
        case "Metadata":
        case "MetadataIndex":
        case "SummaryOffset":
        case "DataEnd":
          yield record;
          break;
        case "Chunk": {
          if (this.#emitChunks) {
            yield record;
            break;
          }
          if (this.#includeChunks) {
            yield record;
          }
          let buffer = record.records;
          if (record.compression !== "" && buffer.byteLength > 0) {
            const decompress2 = this.#decompressHandlers[record.compression];
            if (!decompress2) {
              throw errorWithLibrary(`Unsupported compression ${record.compression}`);
            }
            buffer = decompress2(buffer, record.uncompressedSize);
          }
          if (this.#validateCrcs && record.uncompressedCrc !== 0) {
            const chunkCrc = crc32(buffer);
            if (chunkCrc !== record.uncompressedCrc) {
              throw errorWithLibrary(`Incorrect chunk CRC ${chunkCrc} (expected ${record.uncompressedCrc})`);
            }
          }
          const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
          const chunkReader = new McapByteReader(view);
          let chunkRecord;
          while (chunkRecord = parseRecord(chunkReader, this.#validateCrcs)) {
            switch (chunkRecord.type) {
              case "Header":
              case "Footer":
              case "Chunk":
              case "MessageIndex":
              case "ChunkIndex":
              case "Attachment":
              case "AttachmentIndex":
              case "Statistics":
              case "Metadata":
              case "MetadataIndex":
              case "SummaryOffset":
              case "DataEnd":
                throw errorWithLibrary(`${chunkRecord.type} record not allowed inside a chunk`);
              case "Unknown":
              case "Schema":
              case "Channel":
              case "Message":
                yield chunkRecord;
                break;
            }
          }
          if (chunkReader.bytesRemaining() !== 0) {
            throw errorWithLibrary(`${chunkReader.bytesRemaining()} bytes remaining in chunk`);
          }
          break;
        }
        case "Footer":
          try {
            let magic;
            while (magic = parseMagic(this.#reader), !magic) {
              yield;
            }
          } catch (error) {
            throw errorWithLibrary(error.message);
          }
          if (this.#reader.bytesRemaining() !== 0) {
            throw errorWithLibrary(`${this.#reader.bytesRemaining()} bytes remaining after MCAP footer and trailing magic`);
          }
          return record;
      }
    }
  }
};
function isChannelEqual(a, b) {
  if (!(a.id === b.id && a.messageEncoding === b.messageEncoding && a.schemaId === b.schemaId && a.topic === b.topic && a.metadata.size === b.metadata.size)) {
    return false;
  }
  for (const [keyA, valueA] of a.metadata.entries()) {
    const valueB = b.metadata.get(keyA);
    if (valueA !== valueB) {
      return false;
    }
  }
  return true;
}

// node_modules/@mcap/core/dist/esm/version.js
var VERSION = "2.3.0";
var LIBRARY_IDENTIFIER = `mcap-typescript/${VERSION}`;

// node_modules/fzstd/esm/index.mjs
var ab = ArrayBuffer;
var u8 = Uint8Array;
var u16 = Uint16Array;
var i16 = Int16Array;
var i32 = Int32Array;
var slc = function(v, s, e) {
  if (u8.prototype.slice)
    return u8.prototype.slice.call(v, s, e);
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  var n = new u8(e - s);
  n.set(v.subarray(s, e));
  return n;
};
var fill = function(v, n, s, e) {
  if (u8.prototype.fill)
    return u8.prototype.fill.call(v, n, s, e);
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  for (; s < e; ++s)
    v[s] = n;
  return v;
};
var cpw = function(v, t, s, e) {
  if (u8.prototype.copyWithin)
    return u8.prototype.copyWithin.call(v, t, s, e);
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  while (s < e) {
    v[t++] = v[s++];
  }
};
var ec = [
  "invalid zstd data",
  "window size too large (>2046MB)",
  "invalid block type",
  "FSE accuracy too high",
  "match distance too far back",
  "unexpected EOF"
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var rb = function(d, b, n) {
  var i = 0, o = 0;
  for (; i < n; ++i)
    o |= d[b++] << (i << 3);
  return o;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var rzfh = function(dat, w) {
  var n3 = dat[0] | dat[1] << 8 | dat[2] << 16;
  if (n3 == 3126568 && dat[3] == 253) {
    var flg = dat[4];
    var ss = flg >> 5 & 1, cc = flg >> 2 & 1, df = flg & 3, fcf = flg >> 6;
    if (flg & 8)
      err(0);
    var bt = 6 - ss;
    var db = df == 3 ? 4 : df;
    var di = rb(dat, bt, db);
    bt += db;
    var fsb = fcf ? 1 << fcf : ss;
    var fss = rb(dat, bt, fsb) + (fcf == 1 && 256);
    var ws = fss;
    if (!ss) {
      var wb = 1 << 10 + (dat[5] >> 3);
      ws = wb + (wb >> 3) * (dat[5] & 7);
    }
    if (ws > 2145386496)
      err(1);
    var buf = new u8((w == 1 ? fss || ws : w ? 0 : ws) + 12);
    buf[0] = 1, buf[4] = 4, buf[8] = 8;
    return {
      b: bt + fsb,
      y: 0,
      l: 0,
      d: di,
      w: w && w != 1 ? w : buf.subarray(12),
      e: ws,
      o: new i32(buf.buffer, 0, 3),
      u: fss,
      c: cc,
      m: Math.min(131072, ws)
    };
  } else if ((n3 >> 4 | dat[3] << 20) == 25481893) {
    return b4(dat, 4) + 8;
  }
  err(0);
};
var msb = function(val) {
  var bits = 0;
  for (; 1 << bits <= val; ++bits)
    ;
  return bits - 1;
};
var rfse = function(dat, bt, mal) {
  var tpos = (bt << 3) + 4;
  var al = (dat[bt] & 15) + 5;
  if (al > mal)
    err(3);
  var sz = 1 << al;
  var probs = sz, sym = -1, re = -1, i = -1, ht = sz;
  var buf = new ab(512 + (sz << 2));
  var freq = new i16(buf, 0, 256);
  var dstate = new u16(buf, 0, 256);
  var nstate = new u16(buf, 512, sz);
  var bb1 = 512 + (sz << 1);
  var syms = new u8(buf, bb1, sz);
  var nbits = new u8(buf, bb1 + sz);
  while (sym < 255 && probs > 0) {
    var bits = msb(probs + 1);
    var cbt = tpos >> 3;
    var msk = (1 << bits + 1) - 1;
    var val = (dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (tpos & 7) & msk;
    var msk1fb = (1 << bits) - 1;
    var msv = msk - probs - 1;
    var sval = val & msk1fb;
    if (sval < msv)
      tpos += bits, val = sval;
    else {
      tpos += bits + 1;
      if (val > msk1fb)
        val -= msv;
    }
    freq[++sym] = --val;
    if (val == -1) {
      probs += val;
      syms[--ht] = sym;
    } else
      probs -= val;
    if (!val) {
      do {
        var rbt = tpos >> 3;
        re = (dat[rbt] | dat[rbt + 1] << 8) >> (tpos & 7) & 3;
        tpos += 2;
        sym += re;
      } while (re == 3);
    }
  }
  if (sym > 255 || probs)
    err(0);
  var sympos = 0;
  var sstep = (sz >> 1) + (sz >> 3) + 3;
  var smask = sz - 1;
  for (var s = 0; s <= sym; ++s) {
    var sf = freq[s];
    if (sf < 1) {
      dstate[s] = -sf;
      continue;
    }
    for (i = 0; i < sf; ++i) {
      syms[sympos] = s;
      do {
        sympos = sympos + sstep & smask;
      } while (sympos >= ht);
    }
  }
  if (sympos)
    err(0);
  for (i = 0; i < sz; ++i) {
    var ns = dstate[syms[i]]++;
    var nb = nbits[i] = al - msb(ns);
    nstate[i] = (ns << nb) - sz;
  }
  return [tpos + 7 >> 3, {
    b: al,
    s: syms,
    n: nbits,
    t: nstate
  }];
};
var rhu = function(dat, bt) {
  var i = 0, wc = -1;
  var buf = new u8(292), hb = dat[bt];
  var hw = buf.subarray(0, 256);
  var rc = buf.subarray(256, 268);
  var ri = new u16(buf.buffer, 268);
  if (hb < 128) {
    var _a = rfse(dat, bt + 1, 6), ebt = _a[0], fdt = _a[1];
    bt += hb;
    var epos = ebt << 3;
    var lb = dat[bt];
    if (!lb)
      err(0);
    var st1 = 0, st2 = 0, btr1 = fdt.b, btr2 = btr1;
    var fpos = (++bt << 3) - 8 + msb(lb);
    for (; ; ) {
      fpos -= btr1;
      if (fpos < epos)
        break;
      var cbt = fpos >> 3;
      st1 += (dat[cbt] | dat[cbt + 1] << 8) >> (fpos & 7) & (1 << btr1) - 1;
      hw[++wc] = fdt.s[st1];
      fpos -= btr2;
      if (fpos < epos)
        break;
      cbt = fpos >> 3;
      st2 += (dat[cbt] | dat[cbt + 1] << 8) >> (fpos & 7) & (1 << btr2) - 1;
      hw[++wc] = fdt.s[st2];
      btr1 = fdt.n[st1];
      st1 = fdt.t[st1];
      btr2 = fdt.n[st2];
      st2 = fdt.t[st2];
    }
    if (++wc > 255)
      err(0);
  } else {
    wc = hb - 127;
    for (; i < wc; i += 2) {
      var byte = dat[++bt];
      hw[i] = byte >> 4;
      hw[i + 1] = byte & 15;
    }
    ++bt;
  }
  var wes = 0;
  for (i = 0; i < wc; ++i) {
    var wt = hw[i];
    if (wt > 11)
      err(0);
    wes += wt && 1 << wt - 1;
  }
  var mb = msb(wes) + 1;
  var ts = 1 << mb;
  var rem = ts - wes;
  if (rem & rem - 1)
    err(0);
  hw[wc++] = msb(rem) + 1;
  for (i = 0; i < wc; ++i) {
    var wt = hw[i];
    ++rc[hw[i] = wt && mb + 1 - wt];
  }
  var hbuf = new u8(ts << 1);
  var syms = hbuf.subarray(0, ts), nb = hbuf.subarray(ts);
  ri[mb] = 0;
  for (i = mb; i > 0; --i) {
    var pv = ri[i];
    fill(nb, i, pv, ri[i - 1] = pv + rc[i] * (1 << mb - i));
  }
  if (ri[0] != ts)
    err(0);
  for (i = 0; i < wc; ++i) {
    var bits = hw[i];
    if (bits) {
      var code = ri[bits];
      fill(syms, i, code, ri[bits] = code + (1 << mb - bits));
    }
  }
  return [bt, {
    n: nb,
    b: mb,
    s: syms
  }];
};
var dllt = rfse(/* @__PURE__ */ new u8([
  81,
  16,
  99,
  140,
  49,
  198,
  24,
  99,
  12,
  33,
  196,
  24,
  99,
  102,
  102,
  134,
  70,
  146,
  4
]), 0, 6)[1];
var dmlt = rfse(/* @__PURE__ */ new u8([
  33,
  20,
  196,
  24,
  99,
  140,
  33,
  132,
  16,
  66,
  8,
  33,
  132,
  16,
  66,
  8,
  33,
  68,
  68,
  68,
  68,
  68,
  68,
  68,
  68,
  36,
  9
]), 0, 6)[1];
var doct = rfse(/* @__PURE__ */ new u8([
  32,
  132,
  16,
  66,
  102,
  70,
  68,
  68,
  68,
  68,
  36,
  73,
  2
]), 0, 5)[1];
var b2bl = function(b, s) {
  var len = b.length, bl = new i32(len);
  for (var i = 0; i < len; ++i) {
    bl[i] = s;
    s += 1 << b[i];
  }
  return bl;
};
var llb = /* @__PURE__ */ new u8((/* @__PURE__ */ new i32([
  0,
  0,
  0,
  0,
  16843009,
  50528770,
  134678020,
  202050057,
  269422093
])).buffer, 0, 36);
var llbl = /* @__PURE__ */ b2bl(llb, 0);
var mlb = /* @__PURE__ */ new u8((/* @__PURE__ */ new i32([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  16843009,
  50528770,
  117769220,
  185207048,
  252579084,
  16
])).buffer, 0, 53);
var mlbl = /* @__PURE__ */ b2bl(mlb, 3);
var dhu = function(dat, out, hu) {
  var len = dat.length, ss = out.length, lb = dat[len - 1], msk = (1 << hu.b) - 1, eb = -hu.b;
  if (!lb)
    err(0);
  var st = 0, btr = hu.b, pos = (len << 3) - 8 + msb(lb) - btr, i = -1;
  for (; pos > eb && i < ss; ) {
    var cbt = pos >> 3;
    var val = (dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (pos & 7);
    st = (st << btr | val) & msk;
    out[++i] = hu.s[st];
    pos -= btr = hu.n[st];
  }
  if (pos != eb || i + 1 != ss)
    err(0);
};
var dhu4 = function(dat, out, hu) {
  var bt = 6;
  var ss = out.length, sz1 = ss + 3 >> 2, sz2 = sz1 << 1, sz3 = sz1 + sz2;
  dhu(dat.subarray(bt, bt += dat[0] | dat[1] << 8), out.subarray(0, sz1), hu);
  dhu(dat.subarray(bt, bt += dat[2] | dat[3] << 8), out.subarray(sz1, sz2), hu);
  dhu(dat.subarray(bt, bt += dat[4] | dat[5] << 8), out.subarray(sz2, sz3), hu);
  dhu(dat.subarray(bt), out.subarray(sz3), hu);
};
var rzb = function(dat, st, out) {
  var _a;
  var bt = st.b;
  var b0 = dat[bt], btype = b0 >> 1 & 3;
  st.l = b0 & 1;
  var sz = b0 >> 3 | dat[bt + 1] << 5 | dat[bt + 2] << 13;
  var ebt = (bt += 3) + sz;
  if (btype == 1) {
    if (bt >= dat.length)
      return;
    st.b = bt + 1;
    if (out) {
      fill(out, dat[bt], st.y, st.y += sz);
      return out;
    }
    return fill(new u8(sz), dat[bt]);
  }
  if (ebt > dat.length)
    return;
  if (btype == 0) {
    st.b = ebt;
    if (out) {
      out.set(dat.subarray(bt, ebt), st.y);
      st.y += sz;
      return out;
    }
    return slc(dat, bt, ebt);
  }
  if (btype == 2) {
    var b3 = dat[bt], lbt = b3 & 3, sf = b3 >> 2 & 3;
    var lss = b3 >> 4, lcs = 0, s4 = 0;
    if (lbt < 2) {
      if (sf & 1)
        lss |= dat[++bt] << 4 | (sf & 2 && dat[++bt] << 12);
      else
        lss = b3 >> 3;
    } else {
      s4 = sf;
      if (sf < 2)
        lss |= (dat[++bt] & 63) << 4, lcs = dat[bt] >> 6 | dat[++bt] << 2;
      else if (sf == 2)
        lss |= dat[++bt] << 4 | (dat[++bt] & 3) << 12, lcs = dat[bt] >> 2 | dat[++bt] << 6;
      else
        lss |= dat[++bt] << 4 | (dat[++bt] & 63) << 12, lcs = dat[bt] >> 6 | dat[++bt] << 2 | dat[++bt] << 10;
    }
    ++bt;
    var buf = out ? out.subarray(st.y, st.y + st.m) : new u8(st.m);
    var spl = buf.length - lss;
    if (lbt == 0)
      buf.set(dat.subarray(bt, bt += lss), spl);
    else if (lbt == 1)
      fill(buf, dat[bt++], spl);
    else {
      var hu = st.h;
      if (lbt == 2) {
        var hud = rhu(dat, bt);
        lcs += bt - (bt = hud[0]);
        st.h = hu = hud[1];
      } else if (!hu)
        err(0);
      (s4 ? dhu4 : dhu)(dat.subarray(bt, bt += lcs), buf.subarray(spl), hu);
    }
    var ns = dat[bt++];
    if (ns) {
      if (ns == 255)
        ns = (dat[bt++] | dat[bt++] << 8) + 32512;
      else if (ns > 127)
        ns = ns - 128 << 8 | dat[bt++];
      var scm = dat[bt++];
      if (scm & 3)
        err(0);
      var dts = [dmlt, doct, dllt];
      for (var i = 2; i > -1; --i) {
        var md = scm >> (i << 1) + 2 & 3;
        if (md == 1) {
          var rbuf = new u8([0, 0, dat[bt++]]);
          dts[i] = {
            s: rbuf.subarray(2, 3),
            n: rbuf.subarray(0, 1),
            t: new u16(rbuf.buffer, 0, 1),
            b: 0
          };
        } else if (md == 2) {
          _a = rfse(dat, bt, 9 - (i & 1)), bt = _a[0], dts[i] = _a[1];
        } else if (md == 3) {
          if (!st.t)
            err(0);
          dts[i] = st.t[i];
        }
      }
      var _b = st.t = dts, mlt = _b[0], oct = _b[1], llt = _b[2];
      var lb = dat[ebt - 1];
      if (!lb)
        err(0);
      var spos = (ebt << 3) - 8 + msb(lb) - llt.b, cbt = spos >> 3, oubt = 0;
      var lst = (dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << llt.b) - 1;
      cbt = (spos -= oct.b) >> 3;
      var ost = (dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << oct.b) - 1;
      cbt = (spos -= mlt.b) >> 3;
      var mst = (dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << mlt.b) - 1;
      for (++ns; --ns; ) {
        var llc = llt.s[lst];
        var lbtr = llt.n[lst];
        var mlc = mlt.s[mst];
        var mbtr = mlt.n[mst];
        var ofc = oct.s[ost];
        var obtr = oct.n[ost];
        cbt = (spos -= ofc) >> 3;
        var ofp = 1 << ofc;
        var off = ofp + ((dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16 | dat[cbt + 3] << 24) >>> (spos & 7) & ofp - 1);
        cbt = (spos -= mlb[mlc]) >> 3;
        var ml = mlbl[mlc] + ((dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (spos & 7) & (1 << mlb[mlc]) - 1);
        cbt = (spos -= llb[llc]) >> 3;
        var ll = llbl[llc] + ((dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (spos & 7) & (1 << llb[llc]) - 1);
        cbt = (spos -= lbtr) >> 3;
        lst = llt.t[lst] + ((dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << lbtr) - 1);
        cbt = (spos -= mbtr) >> 3;
        mst = mlt.t[mst] + ((dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << mbtr) - 1);
        cbt = (spos -= obtr) >> 3;
        ost = oct.t[ost] + ((dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << obtr) - 1);
        if (off > 3) {
          st.o[2] = st.o[1];
          st.o[1] = st.o[0];
          st.o[0] = off -= 3;
        } else {
          var idx = off - (ll != 0);
          if (idx) {
            off = idx == 3 ? st.o[0] - 1 : st.o[idx];
            if (idx > 1)
              st.o[2] = st.o[1];
            st.o[1] = st.o[0];
            st.o[0] = off;
          } else
            off = st.o[0];
        }
        for (var i = 0; i < ll; ++i) {
          buf[oubt + i] = buf[spl + i];
        }
        oubt += ll, spl += ll;
        var stin = oubt - off;
        if (stin < 0) {
          var len = -stin;
          var bs = st.e + stin;
          if (len > ml)
            len = ml;
          for (var i = 0; i < len; ++i) {
            buf[oubt + i] = st.w[bs + i];
          }
          oubt += len, ml -= len, stin = 0;
        }
        for (var i = 0; i < ml; ++i) {
          buf[oubt + i] = buf[stin + i];
        }
        oubt += ml;
      }
      if (oubt != spl) {
        while (spl < buf.length) {
          buf[oubt++] = buf[spl++];
        }
      } else
        oubt = buf.length;
      if (out)
        st.y += oubt;
      else
        buf = slc(buf, 0, oubt);
    } else if (out) {
      st.y += lss;
      if (spl) {
        for (var i = 0; i < lss; ++i) {
          buf[i] = buf[spl + i];
        }
      }
    } else if (spl)
      buf = slc(buf, spl);
    st.b = ebt;
    return buf;
  }
  err(2);
};
var cct = function(bufs, ol) {
  if (bufs.length == 1)
    return bufs[0];
  var buf = new u8(ol);
  for (var i = 0, b = 0; i < bufs.length; ++i) {
    var chk = bufs[i];
    buf.set(chk, b);
    b += chk.length;
  }
  return buf;
};
function decompress(dat, buf) {
  var bufs = [], nb = +!buf;
  var bt = 0, ol = 0;
  for (; dat.length; ) {
    var st = rzfh(dat, nb || buf);
    if (typeof st == "object") {
      if (nb) {
        buf = null;
        if (st.w.length == st.u) {
          bufs.push(buf = st.w);
          ol += st.u;
        }
      } else {
        bufs.push(buf);
        st.e = 0;
      }
      for (; !st.l; ) {
        var blk = rzb(dat, st, buf);
        if (!blk)
          err(5);
        if (buf)
          st.e = st.y;
        else {
          bufs.push(blk);
          ol += blk.length;
          cpw(st.w, 0, blk.length);
          st.w.set(blk, st.w.length - blk.length);
        }
      }
      bt = st.b + st.c * 4;
    } else
      bt = st;
    dat = dat.subarray(bt);
  }
  return cct(bufs, ol);
}

// harness.mjs
var import_omgidl_parser = __toESM(require_dist(), 1);
var import_omgidl_serialization = __toESM(require_dist3(), 1);
var MAX_MESSAGES = 4e3;
function stepsOf(path) {
  const re = /\.(\w+)|\[(\d+)\]|\[:\](?:\{(\w+)\s*==\s*"([^"]*)"\})?/g;
  const out = [];
  let m;
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== void 0) out.push({ kind: "field", name: m[1] });
    else if (m[2] !== void 0) out.push({ kind: "index", i: Number(m[2]) });
    else out.push({ kind: "each", key: m[3], val: m[4] });
  }
  return out;
}
function isIndexable(v) {
  return Array.isArray(v) || ArrayBuffer.isView(v);
}
function walk(value, steps) {
  let cur = value;
  for (const s of steps) {
    if (cur == null) return void 0;
    if (s.kind === "field") {
      if (isIndexable(cur)) return void 0;
      cur = cur[s.name];
    } else if (s.kind === "index") {
      if (!isIndexable(cur) || s.i >= cur.length) return void 0;
      cur = cur[s.i];
    } else {
      if (!isIndexable(cur) || cur.length === 0) return void 0;
      if (s.key == null) cur = cur[0];
      else {
        const hit = Array.from(cur).find((e) => String(e?.[s.key]) === s.val);
        if (hit === void 0) return void 0;
        cur = hit;
      }
    }
  }
  return cur;
}
function collectPaths(layout) {
  const out = [];
  for (const [pid, cfg] of Object.entries(layout.configById ?? {})) {
    if (typeof cfg !== "object" || cfg == null) continue;
    if (typeof cfg.topicPath === "string" && cfg.topicPath.trim())
      out.push([pid, cfg.topicPath]);
    for (const key of ["paths", "series"])
      for (const e of cfg[key] ?? [])
        if (e && typeof e.value === "string" && e.value.trim())
          out.push([pid, e.value]);
    if (typeof cfg.path === "string" && cfg.path.trim())
      out.push([pid, cfg.path]);
  }
  return out;
}
function splitTopic(path, topics) {
  const sorted = [...topics].sort((a, b) => b.length - a.length);
  for (const t of sorted) {
    if (path === t) return [t, ""];
    if (path.startsWith(t) && (path[t.length] === "." || path[t.length] === "["))
      return [t, path.slice(t.length)];
  }
  return null;
}
function fmt(v) {
  if (v === void 0) return "\u2014";
  if (v === null) return "null";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(6);
  if (typeof v === "bigint") return String(v);
  if (typeof v === "string") return v;
  if (Array.isArray(v) || ArrayBuffer.isView(v))
    return `[${v.length}] ` + Array.from(v).slice(0, 3).map(fmt).join(", ");
  if (typeof v === "object") {
    const keys = Object.keys(v).slice(0, 4);
    return `{${keys.map((k) => `${k}: ${fmt(v[k])}`).join(", ")}}`;
  }
  return String(v);
}
async function readAll(buf) {
  const bytes = new Uint8Array(buf);
  const out = [];
  const channels = /* @__PURE__ */ new Map();
  const schemas = /* @__PURE__ */ new Map();
  const decompressHandlers = {
    // fzstd's second argument is the OUTPUT BUFFER, not a size hint -- passing
    // the number straight through fails with "out.subarray is not a function".
    zstd: (compressed, decompressedSize) => decompress(compressed, new Uint8Array(Number(decompressedSize)))
  };
  try {
    const reader = await McapIndexedReader.Initialize({
      readable: {
        size: async () => BigInt(bytes.length),
        read: async (offset, length) => bytes.subarray(Number(offset), Number(offset + length))
      },
      decompressHandlers
    });
    for (const s of reader.schemasById.values()) schemas.set(s.id, s);
    for (const c of reader.channelsById.values()) channels.set(c.id, c);
    let n = 0;
    for await (const msg of reader.readMessages()) {
      out.push(msg);
      if (++n >= MAX_MESSAGES) break;
    }
    return { messages: out, channels, schemas, mode: "indexed" };
  } catch (err2) {
    const sr = new McapStreamReader({
      includeChunks: true,
      decompressHandlers
    });
    sr.append(bytes);
    let rec;
    while ((rec = sr.nextRecord()) != null) {
      if (rec.type === "Schema") schemas.set(rec.id, rec);
      else if (rec.type === "Channel") channels.set(rec.id, rec);
      else if (rec.type === "Message" && out.length < MAX_MESSAGES) out.push(rec);
    }
    return { messages: out, channels, schemas, mode: "stream" };
  }
}
async function run() {
  const log = [];
  const say = (s) => log.push(s);
  const params = new URLSearchParams(location.search);
  const mcapUrl = params.get("mcap") ?? "data.mcap";
  const layoutUrl = params.get("layout") ?? "layout.json";
  const [mcapBuf, layout] = await Promise.all([
    fetch(mcapUrl).then((r) => r.arrayBuffer()),
    fetch(layoutUrl).then((r) => r.json())
  ]);
  const { messages, channels, schemas, mode } = await readAll(mcapBuf);
  say(`mcap read via ${mode}: ${messages.length} message(s), ${channels.size} channel(s), ${schemas.size} schema(s)`);
  const readers = /* @__PURE__ */ new Map();
  const parseErrors = [];
  for (const sch of schemas.values()) {
    const text = new TextDecoder().decode(sch.data);
    try {
      const defs = (0, import_omgidl_parser.parseIDL)(text);
      readers.set(sch.id, new import_omgidl_serialization.MessageReader(sch.name, defs));
      say(`schema OK  ${sch.name}  (${defs.length} definitions)`);
    } catch (e) {
      parseErrors.push(`${sch.name}: ${String(e.message).split("\n")[0]}`);
      say(`schema FAIL ${sch.name}: ${String(e.message).split("\n")[0]}`);
    }
  }
  const byTopic = /* @__PURE__ */ new Map();
  const topicOf = /* @__PURE__ */ new Map();
  for (const [id, ch] of channels) topicOf.set(id, ch.topic);
  let decoded = 0;
  const decodeErrors = [];
  for (const msg of messages) {
    const ch = channels.get(msg.channelId);
    if (!ch) continue;
    const rd = readers.get(ch.schemaId);
    if (!rd) continue;
    try {
      const v = rd.readMessage(msg.data);
      if (!byTopic.has(ch.topic)) byTopic.set(ch.topic, []);
      byTopic.get(ch.topic).push(v);
      decoded++;
    } catch (e) {
      if (decodeErrors.length < 3)
        decodeErrors.push(`${ch.topic}: ${String(e.message).split("\n")[0]}`);
    }
  }
  say(`decoded ${decoded} message(s) across ${byTopic.size} topic(s)`);
  const topics = new Set(topicOf.values());
  const rows = [];
  for (const [pid, path] of collectPaths(layout)) {
    const split = splitTopic(path, topics);
    if (!split) {
      rows.push({ pid, path, status: "NO TOPIC", value: "\u2014", hits: 0, total: 0 });
      continue;
    }
    const [topic, rest] = split;
    const msgs = byTopic.get(topic) ?? [];
    const steps = stepsOf(rest);
    let firstIdx = -1;
    let hits = 0;
    let shown;
    msgs.forEach((m, i) => {
      const v = walk(m, steps);
      if (v !== void 0) {
        hits++;
        if (firstIdx < 0) {
          firstIdx = i;
          shown = v;
        }
      }
    });
    rows.push({
      pid,
      path,
      status: hits > 0 ? "DATA" : msgs.length ? "EMPTY" : "NO MESSAGES",
      value: fmt(shown),
      hits,
      total: msgs.length,
      firstIdx
    });
  }
  const el = document.getElementById("out");
  el.innerHTML = "";
  const h = document.createElement("div");
  h.className = "log";
  h.textContent = log.join("\n");
  el.appendChild(h);
  const table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>panel</th><th>status</th><th>value at first match</th><th>matches</th><th>path</th></tr></thead>";
  const tb = document.createElement("tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.className = r.status === "DATA" ? "ok" : "bad";
    tr.innerHTML = `<td class="pid">${r.pid}</td><td class="status">${r.status}</td><td class="val">${r.value}</td><td class="hits">${r.hits}/${r.total}` + (r.firstIdx > 0 ? ` <span class="dim">first@${r.firstIdx}</span>` : "") + `</td><td class="path">${r.path}</td>`;
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  el.appendChild(table);
  const verdict = {
    parseErrors,
    decodeErrors,
    panels: rows.length,
    withData: rows.filter((r) => r.status === "DATA").length,
    rows: rows.map((r) => ({
      pid: r.pid,
      status: r.status,
      hits: r.hits,
      total: r.total,
      value: r.value
    })),
    decoded,
    topics: byTopic.size,
    mode
  };
  const pass = parseErrors.length === 0 && verdict.withData === verdict.panels;
  const banner = document.createElement("div");
  banner.id = "verdict";
  banner.className = pass ? "pass" : "fail";
  banner.textContent = pass ? `RENDER OK \u2014 ${verdict.withData}/${verdict.panels} panel paths show data` : `RENDER FAIL \u2014 ${verdict.withData}/${verdict.panels} panel paths show data` + (parseErrors.length ? `, ${parseErrors.length} schema parse error(s)` : "");
  el.insertBefore(banner, h);
  window.__verdict = verdict;
  document.body.setAttribute("data-done", pass ? "pass" : "fail");
}
run().catch((e) => {
  document.getElementById("out").textContent = "HARNESS ERROR: " + e.stack;
  window.__verdict = { harnessError: String(e.message) };
  document.body.setAttribute("data-done", "error");
});
