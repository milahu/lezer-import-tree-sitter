#! /usr/bin/env bash

test_cases="$@"
if [ -z "$test_cases" ]; then
    test_cases=$(find test/import-antlr4/ -mindepth 1 -maxdepth 1 -type d)
else
    # get absolute paths so we can chdir
    test_cases=$(echo $test_cases | xargs readlink -f)
fi

# chdir to project root
cd "$(dirname "$0")"/../..

# loop test cases
for dir in $test_cases
do

echo
echo "test case: $dir"
name=$(basename "$dir")

if ! [ -d $dir/antlr4-grammar-$name ]; then
  echo no such dir: $dir/antlr4-grammar-$name
  exit 1
fi

parser=$(find $dir/antlr4-grammar-$name -maxdepth 1 -type f -name "*Parser.g4" 2>/dev/null)
lexer=$(find $dir/antlr4-grammar-$name -maxdepth 1 -type f -name "*Lexer.g4" 2>/dev/null)
if [ -z "$parser" ]; then
  parser=$(find $dir/antlr4-grammar-$name -maxdepth 1 -type f -name "*.g4")
fi

d="$dir/lezer-parser-$name/src"
[ -d "$d" ] || mkdir -p "$d"

out="$dir/lezer-parser-$name/src/grammar.lezer"
echo "importing from"
echo "  $parser"
if [ -n "$lexer" ]; then
  echo "  $lexer"
fi
echo "to"
echo "  $out"
echo "node src/import-antlr4 $parser $lexer >$out"
node src/import-antlr4 $parser $lexer >$out

echo
echo "solving conflicts to $out.fixed"
echo "node src/import-antlr4/solve-conflicts.js $out $lexer $parser"
node src/import-antlr4/solve-conflicts.js $out $lexer $parser

done
