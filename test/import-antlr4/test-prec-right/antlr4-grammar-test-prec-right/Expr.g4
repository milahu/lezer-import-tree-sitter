// https://github.com/antlr/antlr4/blob/master/doc/left-recursion.md
// https://github.com/antlr/antlr4/blob/master/doc/getting-started.md

grammar Expr;

prog: expr EOF;

expr
  : expr '*' expr
  | expr '+' expr
  | <assoc=right> expr '?' expr ':' expr
  | <assoc=right> expr '=' expr
  | INT
  ;

NEWLINE: [\r\n]+ -> skip;

INT: [0-9]+;
