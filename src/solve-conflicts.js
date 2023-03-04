/*

https://github.com/lezer-parser/import-tree-sitter#limitations
Precedences are specified in a more fine-grained way in Lezer,
so the tool only emits a comment indicating that a precedence was specified,
and leaves it to you to put the proper conflict markers in.

https://lezer.codemirror.net/docs/guide/#precedence

related

using tree-sitter for AST transformation/codegen
https://github.com/tree-sitter/tree-sitter/issues/642

https://stackoverflow.com/questions/4468086/any-tools-can-randomly-generate-the-source-code-according-to-a-language-grammar

https://github.com/kach/nearley/blob/master/lib/unparse.js

https://stackoverflow.com/questions/603687/how-do-i-generate-sentences-from-a-formal-grammar/3292027#3292027

Data Generation Language
http://cs.baylor.edu/~maurer/dgl.html

https://stackoverflow.com/questions/54159852/can-antlr-or-other-tool-generate-valid-code-for-given-grammar

https://github.com/mike-lischke/vscode-antlr4/blob/master/src/backend/SentenceGenerator.ts

https://gitlab.com/gitlab-org/security-products/analyzers/fuzzers/jsfuzz

*/

import fs from "fs"
import {Context} from "../dist/import.js"

import TreeSitter from "tree-sitter" // node-tree-sitter. requires node 18. see shell.nix
import TreeSitterBash from "tree-sitter-bash"

main()

async function main() {

// tree-sitter aka node-tree-sitter
const sitterParser = new TreeSitter();
sitterParser.setLanguage(TreeSitterBash);

const lezerGeneratorLogPath = "test/cases/bash/lezer-parser-bash/lezer-generator.err.txt"
const sitterGrammerJsonPath = "test/cases/bash/tree-sitter-bash/src/grammar.json"

const lezerGeneratorLog = fs.readFileSync(lezerGeneratorLogPath, "utf8")
const sitterGrammer = JSON.parse(fs.readFileSync(sitterGrammerJsonPath, "utf8"))

const lezerRuleNames = Object.fromEntries(
  Object.entries(sitterGrammer.rules)
  .map(([sitterName, sitterRule]) => [sitterName, Context.prototype.translateName(sitterName)])
)
// inverse map
const sitterRuleNames = Object.fromEntries(
  Object.entries(lezerRuleNames)
  .map(([sitterName, lezerName]) => [lezerName, sitterName])
)
//console.dir({lezerRuleNames})
//console.dir({sitterRuleNames})

const conflicts = []

lezerGeneratorLog.replace(
  /(?:^|\n)(\w+)\/(\w+) conflict between\n  ([^\n]+)\nand\n  ([^\n]+)\nWith input:\n  ([^\n]+)\nShared origin: (.*?)\n(?:\n|$)/sg,
  (_match, op1, op2, solution1, solution2, input, origin) => {
    /*
    // no. keep "..." als wildcard
    if (input.endsWith(" …")) {
      input = input.slice(0, -2)
    }
    */
    conflicts.push({op1, op2, solution1, solution2, input, origin})
  }
)

//console.dir(conflicts); return

//const conflict = conflicts.slice(-2)[0]
const conflict = conflicts[0]

conflict.inputTokens = conflict.input.split(" ")
conflict.sitterInputTokens = (
  conflict.inputTokens.map(lezerName => {
    if (lezerName in sitterRuleNames) {
      return sitterRuleNames[lezerName]
    }
    return lezerName
  })
)
// "·" = current position of parser

console.dir(conflict)

// example:
//
// inputTokens: [ '"["', 'TestOperator', 'expression', '·', '"<"', '…' ]
// 
//   TestOperator /* precedence: 1 */ {
//     "-" $[a-zA-Z]+
//   }

//   op1: 'shift',
//   op2: 'reduce',
//   solution1: 'BinaryExpression -> expression · "<" expression',
//   solution2: 'UnaryExpression -> TestOperator expression',
//   input: '"[" TestOperator expression · "<" …',
//   origin:
//     'expression -> · UnaryExpression\n' +
//     '  via UnaryExpression -> TestOperator · expression\n' +
//     '    via expression -> · BinaryExpression\n' +
//     '      BinaryExpression -> expression · "<" expression',
//   inputTokens: [ '"["', 'TestOperator', 'expression', '·', '"<"' ],
//   sitterInputTokens: [ '"["', 'test_operator', '_expression', '·', '"<"' ]

// what tokens belong together?

//               UnaryExpression
//               vvvvvvvvvvvvvvvvvvvvvvv
//   input: '"[" TestOperator expression · "<" …',
//                            ^^^^^^^^^^^^^^^^^^
//                            BinaryExpression

//const sourceCode = '[ -e expr < expr ]';
//const sourceCode = '[ -e expr < expr';
/*
program: "[ -e expr < expr"
  test_command: "[ -e expr < expr"
    [: "["
    unary_expression: "-e expr < expr"
      test_operator: "-e"
      binary_expression: "expr < expr"
        word: "expr"
        <: "<"
        word: "expr"



so binary_expression has precedence over unary_expression/test_operator



tree-sitter-bash/grammar.js

  binary_expression -> prec.left
  unary_expression -> prec.right

  binary_expression: $ => prec.left(choice(
    seq(
      field('left', $._expression),
      field('operator', choice(
        '=', '==', '=~', '!=',
        '+', '-', '+=', '-=',
        '<', '>', '<=', '>=',
        '||', '&&',
        $.test_operator
      )),
      field('right', $._expression)
    ),
    seq(
      field('left', $._expression),
      field('operator', choice('==', '=~')),
      field('right', $.regex)
    )
  )),

  unary_expression: $ => prec.right(seq(
    choice('!', $.test_operator),
    $._expression
  )),

  test_operator: $ => token(prec(1, seq('-', /[a-zA-Z]+/))),



grammar.lezer

  @precedence {
    PrecBinaryExpression @left,
    PrecUnaryExpression @right
  }

  BinaryExpression {
    expression !PrecBinaryExpression (kw<"="> | kw<"=="> | kw<"=~"> | kw<"!="> | kw<"+"> | kw<"-"> | kw<"+="> | kw<"-="> | "<" | ">" | "<=" | ">=" | "||" | "&&" | TestOperator) expression |
    //         +++++++++++++++++++++
    expression !PrecBinaryExpression (kw<"=="> | kw<"=~">) Regex
    //         +++++++++++++++++++++
  }

  UnaryExpression {
    (kw<"!"> | TestOperator) !PrecUnaryExpression expression
    //                       ++++++++++++++++++++
  }



TODO parse precedence from

tree-sitter-bash/src/grammar.json

  "binary_expression": {
    "type": "PREC_LEFT",

  "unary_expression": {
    "type": "PREC_RIGHT",

*/

/*

conflict =
{
  op1: 'shift',
  op2: 'reduce',
  solution1: 'specialCharacter+ -> · specialCharacter',
  solution2: 'Word-1 -> specialCharacter+',
  input: 'specialCharacter+ · specialCharacter …',
  origin:
    'literal -> · Word-1\n' +
    '  via Word-1 -> · specialCharacter+\n' +
    '    via specialCharacter+ -> specialCharacter+ · specialCharacter+\n' +
    '      specialCharacter+ -> · specialCharacter',
  inputTokens: [ 'specialCharacter+', '·', 'specialCharacter', '…' ],
  sitterInputTokens: [ 'specialCharacter+', '·', '_special_character', '…' ]
}

rule names map:
specialCharacter -> _special_character
Word-1 -> word // TODO why "-1"?

tree-sitter-bash/grammar.js

  word: $ => $.word,

  rules: {

    _special_character: $ => token(prec(-1, choice('{', '}', '[', ']'))),

    word: $ => token(seq(
      choice(
        noneOf('#', ...SPECIAL_CHARACTERS),
        seq('\\', noneOf('\\s'))
      ),
      repeat(choice(
        noneOf(...SPECIAL_CHARACTERS),
        seq('\\', noneOf('\\s'))
      ))
    )),

    _literal: $ => choice(
      $.concatenation,
      $._primary_expression,
      alias(prec(-2, repeat1($._special_character)), $.word)
    ),




lezer-parser-bash/src/grammar.lezer

literal {
  Concatenation |
  primaryExpression |
  // FIXME this looks wrong
  // alias(prec(-2, repeat1($._special_character)), $.word)
  //Word { (specialCharacter+) } // aka Word-1
  WordOfSpecialCharacters { (specialCharacter+) }
}

@tokens {
  specialCharacter {
    "{" | "}" | "[" | "]"
  }
  Word {
    (
      ![#'"<>{}\[\]()`$|&;\\ \t\n\r] |
      "\\" ![ \t\n\r]
    )
    (
      !['"<>{}\[\]()`$|&;\\ \t\n\r] |
      "\\" ![ \t\n\r]
    )*
  }



>   Word { (specialCharacter+) } // FIXME this lloks wrong

tree-sitter-bash/grammar.js

  _literal: $ => choice(
    $.concatenation,
    $._primary_expression,
    alias(prec(-2, repeat1($._special_character)), $.word)
  ),

lezer-parser-bash/src/grammar.lezer
collision between rule-name and token-name

  literal {
    Concatenation |
    primaryExpression |
    Word { (specialCharacter+) }
  }

  @tokens {
    Word {
      (![#'"<>{}\[\]()`$|&;\\ \t\n\r] | "\\" ![ \t\n\r]) (!['"<>{}\[\]()`$|&;\\ \t\n\r] | "\\" ![ \t\n\r])*
    }
  }



TODO how is "_special_character" reachable?

    _literal: $ => choice(
      $.concatenation,
      $._primary_expression,
      alias(prec(-2, repeat1($._special_character)), $.word)
    ),

*/

//const sourceCode = '{ { } }';
const sourceCode = 'arr=(a b c { [ )';
/*

WONTFIX tree-sitter grammar is wrong

program: "arr=(a b c { [ )"
  variable_assignment: "arr=(a b c { [ )"
    variable_name: "arr"
    =: "="
    array: "(a b c { [ )"
      (: "("
      word: "a"
      word: "b"
      word: "c"
      word: "{ ["
      ): ")"

-> source of truth is the bash source code

yacc grammar at

https://github.com/gitGNU/gnu_bash/blob/master/parse.y

*/



const tree = sitterParser.parse(sourceCode);
//console.dir(tree)

//tree.rootNode.

const cursor = tree.walk();


let depth = 0
while (true) {
  const indent = "  ".repeat(depth)
  const src = sourceCode.slice(cursor.startIndex, cursor.endIndex)
  console.log(`${indent}${cursor.nodeType}: ${JSON.stringify(src)}`)
  if (cursor.gotoFirstChild()) {
    // down
    depth++
    continue
  }
  if (cursor.gotoNextSibling()) {
    // right
    continue
  }
  // TODO up
  break
}

process.exit()

}
