/* vim: set sw=2 syntax=javascript : */

/**
 * Patch Reader
 *
 * Parses a patch file into an object, with
 *
 * prologue: text before the first file
 * files: array of files
 *   header: text before the first hunk
 *   src: name of the old file
 *   dest: name of the new file
 *   hunks: array of changes
 *    range: the lines involved, "@@ -start,length +start,length @@"
 *    runs: array of lines:
 *      type: "added", "removed", "changed", "context"
 *      left: (removed/changed/context) old lines (array of string)
 *      right: (added/changed/context) new lines (array of string)
 * epilogue: text after the last file
 */

function PatchReader(aPatchContents) {
  var result = {
    prologue: [],
    files: [],
    epilogue: []
  };

  var lines = aPatchContents.split(/\r?\n/);
  const RE_START_FILE = /^(?:Index:|(?:\w+ )?diff |\-\-\-|\+\+\+)/;
  const RE_START_HUNK = /^@@ -\d+,\d+ \+\d+,\d+ @@/;
  
  // prologue
  while (lines.length > 0) {
    let line = lines[0];
    if (RE_START_FILE(line)) {
      // starting a file
      break;
    }
    result.prologue.push(lines.shift());
  }

  // body
  while (lines.length > 0) {
    let line = lines[0];
    if (RE_START_FILE(line)) {
      // start of a file
      var file = {header: result.epilogue,
                  hunks: []};
      while (!RE_START_HUNK(line)) {
        if (/^\-\-\-/(line)) {
          file.src = FileName(line);
        }
        else if (/^\+\+\+/(line)) {
          file.dest = FileName(line);
        }
        file.header.push(lines.shift());
        line = lines[0];
      }

      // process the hunks
      while (RE_START_HUNK(line)) {
        var hunk = parseHunk(lines);
        if (!hunk) break;
        file.hunks.push(hunk);
        line = lines[0];
      }

      result.files.push(file);
      result.epilogue = [];
    }
    else {
      // stuff before the file, or after the last file.
      // stick it in epilogue for now
      result.epilogue.push(lines.shift());
    }
  }

  return result;
}

/**
 * Convert a file name (--- or +++ line) to a nice object
 * Properties:
 *   file: the name of the file
 *   type: "added" or "removed"
 *   date: the date of the file, if available
 *   revision: the file revision, if available
 */
function FileName(aLine) {
  var result = {line: aLine}, match;
  const RE_TYPE = /^(\-\-\-|\+\+\+) /;
  const RE_CVS = /^(.*)\t(\d+ [A-Z][a-z]{2} \d+ (?:\d\d:){2}\d\d [+-]\d{4})(?:\t([\d.]+))?$/;
  const RE_HG = /^(?:[ab]\/)?(.*)\t((?:[A-Z][a-z]{2} ){2}\d\d (?:\d\d:){2}\d\d \d+ [+-]\d{4})$/;
  const RE_SVN = /^(.*?) +\((revision \d+|working copy)\)$/;
  if ((match = RE_TYPE(aLine))) {
    result.type = {
      "---": "removed",
      "+++": "added"
    }[match[1]];
    aLine = aLine.substr(match[0].length);
    if ((match = RE_CVS(aLine))) {
      result.file = match[1];
      result.date = match[2];
      result.revision = match[3] || "working copy";
    }
    else if ((match = RE_HG(aLine))) {
      result.file = match[1];
      result.date = match[2];
    }
    else if ((match = RE_SVN(aLine))) {
      result.file = match[1];
      result.revision = match[2].replace(/^revision /, "");
    }
    else {
      result.data = aLine;
    }
    result.toString = function() {
      return this.file;
    }
  }
  return result;
}

/**
 * Parses lines for a hunk, removing read lines
 * @return a hunk, or null if parse failed
 */
function parseHunk(aLines) {
  var result = {runs: []};
  { /** build result.range **/
    result.range = new String(aLines.shift());
    var match = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/(result.range);
    if (!match) {
      // should never have gotten here... oops!
      aLines.unshift(result.range);
      return null;
    }
    result.range.leftStart = parseInt(match[1], 10);
    result.range.leftCount = parseInt(match[2], 10);
    result.range.rightStart = parseInt(match[3], 10);
    result.range.rightCount = parseInt(match[4], 10);
  }
  var leftCount = result.range.leftCount, rightCount = result.range.rightCount;
  var leftNum = result.range.leftStart, rightNum = result.range.rightStart;
  while ((leftCount > 0 || rightCount > 0) && aLines.length > 0) {
    let run = {left: [], right: [], type: null};
    switch(aLines[0][0]) {
      case "-": { /* removed or changed */
        run.type = "removed";
        while (aLines[0][0] == "-" && leftCount > 0) {
          let str = new String(aLines.shift());
          str.lineno = leftNum++;
          run.left.push(str);
          --leftCount;
        }
        if (aLines[0][0] == "+" && rightCount > 0) {
          run.type = "changed";
          while (aLines[0][0] == "+" && rightCount > 0) {
            let str = new String(aLines.shift());
            str.lineno = rightNum++;
            run.right.push(str);
            --rightCount;
          }
        }
        break;
      }
      case "+": { /* added */
        run.type = "added";
        while (aLines[0][0] == "+" && rightCount > 0) {
          let str = new String(aLines.shift());
          str.lineno = rightNum++;
          run.right.push(str);
          --rightCount;
        }
        break;
      }
      case " ": { /* context */
        run.type = "context";
        while (aLines[0][0] == " " && leftCount > 0 && rightCount > 0) {
          let line = aLines.shift();
          let str = new String(line);
          str.lineno = leftNum++;
          run.left.push(str);
          --leftCount;
          str = new String(line);
          str.lineno = rightNum++;
          run.right.push(str);
          --rightCount;
        }
        break;
      }
      default: {
        return result;
      }
    }
    result.runs.push(run);
  }

  return result;
}
