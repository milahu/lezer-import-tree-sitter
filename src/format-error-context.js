// wrap text to terminalWidth
// keep input line numbers
// get context lines around input index
// add caret under char at input index

// could not find a NPM library for this
// and spent way too long googling for done solution.
// so i wrote it myself

export function formatErrorContext(text, pos, contextLines = 10) {

  const inputLineList = text.split('\n');
  const outputLineList = [];
  let inputLine = 0;
  let inputIndex = 0;
  const terminalWidth = 72;

  let posOutputLine = -1;

  for (const inputText of inputLineList) {

    inputLine++;

    // branch 1: dont wrap this line
    if (inputText.length <= terminalWidth) {
      // +1 for '\n' in text.split('\n')
      const nextInputIndex = inputIndex + inputText.length + 1;
      const posInLine = (inputIndex <= pos && pos < nextInputIndex);
      if (posInLine) {
        // add empty line before pos line
        outputLineList.push({
          index: inputIndex,
          line: inputLine,
          wrapped: null,
          empty: true,
          caret: false,
          text: null,
        });
      }
      outputLineList.push({
        index: inputIndex,
        line: inputLine,
        wrapped: false,
        empty: false,
        caret: false,
        text: inputText,
      });
      if (posInLine) {
        posOutputLine = outputLineList.length;
        // add caret below pos
        outputLineList.push({
          // index cannot be pos
          // otherwise X position of caret is wrong with unpadded numbers
          //index: pos,
          index: inputIndex,
          line: inputLine,
          wrapped: false,
          caret: true,
          text: ' '.repeat(pos - inputIndex) + `^`,
        });
        // add pos under caret
        outputLineList.push({
          index: inputIndex,
          line: inputLine,
          wrapped: false,
          caret: true,
          text: ' '.repeat(pos - inputIndex) + `${pos}`,
        });
        // add empty line after caret line
        outputLineList.push({
          index: nextInputIndex,
          line: (inputLine + 1),
          wrapped: null,
          empty: true,
          caret: false,
          text: null,
        });
      }
      inputIndex = nextInputIndex;
      continue;
    }

    // branch 2: wrap this line
    let wrapped = false;
    for (let i = 0; i < inputText.length; i = i + terminalWidth) {
      const linePart = inputText.slice(i, i + terminalWidth);
      const nextInputIndex = inputIndex + linePart.length;
      const outputLine = {
        index: inputIndex,
        line: inputLine,
        wrapped,
        caret: false,
        text: linePart,
      };
      //console.dir(outputLine)
      outputLineList.push(outputLine);
      // TODO refactor with branch 1
      if (inputIndex <= pos && pos < nextInputIndex) {
        posOutputLine = outputLineList.length;
        // add caret below pos
        outputLineList.push({
          // index cannot be pos
          // otherwise X position of caret is wrong with unpadded numbers
          //index: pos,
          index: inputIndex,
          line: inputLine,
          wrapped,
          caret: true,
          text: ' '.repeat(pos - inputIndex) + `^ ${pos}`,
        });
      }
      // update loop vars
      wrapped = true;
      inputIndex = nextInputIndex;
    }
    inputIndex++;
  }

  if (posOutputLine == -1) {
    throw Error(`FIXME posOutputLine == -1 -> pos ${pos} not found in text?`)
  }

  // TODO leftPad line number

  // TODO allow to return array of lines

  return (
    outputLineList.slice(
      posOutputLine - contextLines,
      posOutputLine + contextLines,
    ).map(({ line, index, text, empty }) => empty ? '' : `${line} ${index}: ${text}`).join('\n')
  )

}



/*
// test
const text = 'x'.repeat(200) + 'asdf' + 'x'.repeat(200);
const pos = 200;

for (const line of formatErrorContext(text, pos)) {
  console.log(line);
}
*/
