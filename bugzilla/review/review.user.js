// ==UserScript==
// @name           bugzilla review
// @namespace      https://github.com/mook/greasemonkey-scripts/bugzilla
// @description    Review editor for bugzilla
// @include        */attachment.cgi?id=*&action=edit
// @require        String.js
// @require        NodeList.js
// @resource       REVIEW_CSS Review.css
// ==/UserScript==
// vim: set sw=2 syntax=javascript : */

/**
 * Constants
 */

const HTML_NS = "http://www.w3.org/1999/xhtml";

var location = { __proto__ : window.location };

/**
 * Log debugging messages
 */
function LOG() {
  if ("console" in window && "log" in window.console) {
    window.console.log.apply(window.console, [].slice.call(arguments));
  }
  else {
    GM_log.apply(this, [].slice.call(arguments));
  }
}

/**
 * Function to start the review, triggered by the user-visible button
 */
function startReview() {
  setTimeout(function(){
    location.href="javascript:editAsComment()";
  }, 0);
  document.documentElement.setAttribute("reviewing", true);

  var reviewFrame = document.getElementById("reviewFrame");
  if (reviewFrame) {
    restoreComments();
    return;
  }

  GM_xmlhttpRequest({
    method: "GET",
    url: location.root + "attachment.cgi?id=" + location.attachmentid,
    overrideMimeType: "text/plain",
    onload: function(aResponse) {
      loadDiff(aResponse.responseText);
    }
  });

  reviewFrame = document.createElementNS(HTML_NS, "section");
  document.querySelector(".attachment_info").appendChild(reviewFrame);
  reviewFrame.id = "reviewFrame";
  reviewFrame.classList.add("review");
}

/**
 * Function to end the review, writing out the text and hiding the review UI
 */
function doneReview() {
  var editFrame = document.getElementById("editFrame");
  var reviewFrame = document.getElementById("reviewFrame");

  var text = ["(from review of attachment " + location.attachmentid + ")"];
  for each (let table in (reviewFrame.querySelectorAll(".file_table"))) {
    for (let [, line] in Iterator(table.file.header)) {
      text.push(">" + line);
    }
    for each (let hunk in table.querySelectorAll(".hunk")) {
      text.push(">@@ " + hunk.querySelector(".section_head").textContent + " @@");
      for (let run = 0; true; ++run) {
        let selector = "tr[run='" + run + "']";
        let sample = hunk.querySelector(selector);
        if (!sample) {
          // end of run
          break;
        }
        if (sample.classList.contains("context")) {
          for each (let left in hunk.querySelectorAll(selector + " .left .line")) {
            text.push("> " + left.textContent);
            let key = getDBKeyForSpan(left);
            let comment = localStorage.getItem(key);
            let hasLeftComment = false;
            if (comment !== null) {
              hasLeftComment = true;
              text.push(comment);
            }
            comment = localStorage.getItem(key.replace(/-left$/, "-right"));
            if (comment !== null) {
              if (hasLeftComment) {
                text.push("-----");
              }
              text.push(comment);
            }
          }
        }
        else {
          for each (let left in hunk.querySelectorAll(selector + " .left .line")) {
            text.push(">-" + left.textContent);
            let comment = localStorage.getItem(getDBKeyForSpan(left));
            if (comment !== null) {
              text.push(comment);
            }
          }
          for each (let right in hunk.querySelectorAll(selector + " .right .line")) {
            text.push(">+" + right.textContent);
            let comment = localStorage.getItem(getDBKeyForSpan(right));
            if (comment !== null) {
              text.push(comment);
            }
          }
        }
      }
    }

    continue;
    for each (let row in table.querySelectorAll(".hunk > tr")) {
      /*
      if (row.querySelector(".section_head")) {
        // this is a diff hunk marker
        let lineStr = row.querySelector("th:first-of-type").textContent;
        lineStr = lineStr.split(/\n/)
                         .filter(function(s)/^\s*Line/(s))[0]
                         .trim();
        text.push("@" + lineStr + "@");
        continue;
      }
      */
      function getKey(aPre) {
        return "review-" + location.attachmentid +
               "-file-" + table.getAttribute("filename") +
               "-line-" + aPre.getAttribute("line_number");
      }
      function doComment(aPre) {
        var comment = localStorage.getItem(getKey(aPre));
        if (comment !== null) {
          text.push(comment);
        }
      }
      if (row.classList.contains("changed")) {
        let pre = row.querySelector(".left span");
        if (pre) {
          text.push("> -" + pre.textContent);
          doComment(pre);
        }

        pre = row.querySelector(".right span");
        if (pre) {
          text.push("> +" + pre.textContent);
          doComment(pre);
        }
      }
      else if (row.classList.contains("added")) {
        let pre = row.querySelector(".right span");
        text.push("> +" + pre.textContent);
        doComment(pre);
      }
      else if (row.classList.contains("removed")) {
        let pre = row.querySelector(".left span");
        text.push("> -" + pre.textContent);
        doComment(pre);
      }
      else {
        /* no change */
        text.push(">  " + row.querySelector(".left .line").textContent);
        for each (let pre in row.querySelectorAll("pre")) {
          doComment(pre);
        }
      }
      
    }
  }

  editFrame.value = text.concat("").join("\n");
}


/**
 * Callback for loading the raw patch
 * @param aDiffContents the text of the patch
 */
function loadDiff(aDiffContents) {
  var patch = PatchReader(aDiffContents);
  var reviewFrame = document.getElementById("reviewFrame");

  document.getElementById("editFrame").value =
    patch.prologue.map(function(line)">"+ line).join("\n");

  for (let [, file] in Iterator(patch.files)) {
    let table = document.createElementNS(HTML_NS, "table");
    reviewFrame.appendChild(table);
    table.classList.add("file_table");
    table.file = file;
    table.addEventListener("dblclick", onDiffDoubleClick, false);
    table.setAttribute("filename", encodeURIComponent(file.src || file.dest));

    { /** file header (check box to hide file and file name) */
      let thead = document.createElementNS(HTML_NS, "thead");
      thead.classList.add("file_head");
      thead.classList.add("visible");
      table.appendChild(thead);
      let row = document.createElementNS(HTML_NS, "tr");
      thead.appendChild(row);
      let cell = document.createElementNS(HTML_NS, "th");
      row.appendChild(cell);
      cell.setAttribute("colspan", 2);
      let label = document.createElementNS(HTML_NS, "label");
      label.textContent = file.src || file.dest;
      cell.appendChild(label);
      let checkbox = document.createElementNS(HTML_NS, "input");
      checkbox.setAttribute("type", "checkbox");
      checkbox.addEventListener("change", function() {
        thead.classList[checkbox.checked ? "add" : "remove"]("visible");
      }, false);
      checkbox.checked = true;
      label.insertBefore(checkbox, label.firstChild);
    }

    
    for (let [, hunk] in Iterator(file.hunks)) { /** each hunk in file */
      let tbody = document.createElementNS(HTML_NS, "tbody");
      table.appendChild(tbody);
      tbody.classList.add("hunk");
      tbody.hunk = hunk;
      let row = document.createElementNS(HTML_NS, "tr");
      tbody.appendChild(row);
      row.classList.add("section_head");
      let cell = document.createElementNS(HTML_NS, "th");
      row.appendChild(cell);
      cell.setAttribute("colspan", 2);
      cell.textContent = hunk.range.replace(/@@ (.*) @@/, "$1");

      for (let [run_id, run] in Iterator(hunk.runs)) { /** each run in a hunk */
        for (let i = 0; i < Math.max(run.left.length, run.right.length); ++i) {
          let row = document.createElementNS(HTML_NS, "tr");
          tbody.appendChild(row);
          row.classList.add(run.type);
          row.setAttribute("run", run_id);

          { /** left column (old file) */
            let left = document.createElementNS(HTML_NS, "td");
            left.classList.add("left");
            row.appendChild(left);
            if (i in run.left) {
              let text = document.createElementNS(HTML_NS, "span");
              text.textContent = run.left[i].substr(1);
              text.setAttribute("line_number", run.left[i].lineno);
              text.classList.add("line");
              left.appendChild(text);
            }
          }

          { /** right column (new file) */
            let right = document.createElementNS(HTML_NS, "td");
            right.classList.add("right");
            row.appendChild(right);
            if (i in run.right) {
              text = document.createElementNS(HTML_NS, "span");
              text.textContent = run.right[i].substr(1);
              text.setAttribute("line_number", run.right[i].lineno);
              text.classList.add("line");
              right.appendChild(text);
            }
          }
        }
      }
    }
  }

  restoreComments();
}


/**
 * Restore all previously saved comments
 */
function restoreComments() {
  var reviewFrame = document.getElementById("reviewFrame");
  for (var i = 0; i < localStorage.length; ++i) {
    var key = localStorage.key(i);
    var match = /^review-(\d+)-file-(.*)-line-(\d+)-([a-z]+)/.exec(key);
    if (match && match[1] == location.attachmentid) {
      var line = reviewFrame.querySelector('.file_table[filename="' + match[2] +
                                           '"] .' + match[4] +
                                           ' .line[line_number="' + match[3] +
                                           '"]');
      if (line) {
        updateComment(line);
      }
    }
  }
  reviewFrame.scrollIntoView();
}

/**
 * Get the localStorage key for a given span.line
 */
function getDBKeyForSpan(aSpan) {
  var side = aSpan.parentNode.classList.contains("left") ? "left" :
             aSpan.parentNode.classList.contains("right") ? "right" :
             "middle";
  var table = aSpan.parentNode;
  while (!table.classList.contains("file_table")) {
    table = table.parentNode;
  }
  return "review-" + location.attachmentid +
         "-file-" + table.getAttribute("filename") +
         "-line-" + aSpan.getAttribute("line_number") +
         "-" + side;
}

/**
 * update the comment display for a given line
 * @param aSpan a span.line to update
 */
function updateComment(aSpan) {
  var key = getDBKeyForSpan(aSpan);
  var match = /-line-(\d+)-([a-z]+)$/(key);
  var comment = localStorage.getItem(key);
  var display = aSpan.parentNode.querySelector(".comment");
  if (comment) {
    if (!display) {
      display = document.createElementNS(HTML_NS, "span");
      display.classList.add("comment");
      aSpan.parentNode.insertBefore(display, aSpan.nextSibling);
    }
    display.textContent = comment;
  }
  else {
    if (display) {
      display.parentNode.removeChild(display);
    }
  }
}

/**
 * Handler for double clicking on the diff
 */
function onDiffDoubleClick(event) {
  var target = event.target;
  while (target && !(target instanceof HTMLTableCellElement)) {
    target = target.parentNode;
  }
  if (target && target.parentNode.hasAttribute("run")) {
    var editor = document.getElementById("reviewEditor");
    if (editor) {
      editor.blur();
    }

    var line = target.querySelector(".line");
    var key = getDBKeyForSpan(line);

    editor = document.createElementNS(HTML_NS, "textarea");
    editor.id = "reviewEditor";
    editor.line = line;
    editor.value = localStorage.getItem(key) || "";
    line.parentNode.insertBefore(editor, line.nextSibling);
    editor.addEventListener("blur", onEditorBlur, false);

    editor.focus();
  }
}

/**
 * Handler for releasing the editor
 */
function onEditorBlur(event) {
  var editor = document.getElementById("reviewEditor");
  if (!editor) return;

  var span = editor.line;
  LOG(span);
  var key = getDBKeyForSpan(span);
  LOG("save: " + key + " <-- " + editor.value);

  if (editor.value.length > 0) {
    localStorage.setItem(key, editor.value);
  }
  else {
    localStorage.removeItem(key);
  }

  editor.parentNode.removeChild(editor);
  updateComment(span);
}

/**
 * Entry point for the main script
 */
(function main(){ /* wrapper to make komodo syntax checking happy */

{ /** Sanity check and read bug info **/
  let isPatch = document.getElementById("ispatch");
  if (!isPatch || !isPatch.checked) {
    // no patch checkbox, or not a patch
    return;
  }

  let link = document.querySelector("link[rel='Up']");
  if (!link || !/^show_bug\.cgi\?id=/.test(link.getAttribute("href"))) {
    // not a bugzilla attachment page
    return;
  }
  location.bugid = link.getAttribute("href").split(/=/, 2).pop();
  location.attachmentid = location.search.replace(/^.*id=(\d+).*$/, "$1");
  location.root = document.querySelector("link[rel='Top']").href;
  
  let logout = document.querySelector("a[href='relogin.cgi']");
  if (logout) {
    // user is optional - might be logged out
    location.user = logout.nextSibling.textContent.trim();
  }
  

  //let flagInputs = document.querySelectorAll('input');
  //let reviewer = document.querySelector('input[name^=requestee-]');
  //alert(reviewer);
}

{ /** Install the stylesheet **/
  GM_addStyle(GM_getResourceText("REVIEW_CSS"));
}

{ /** Set up the UI to start reviewing **/
  let viewRawButton = document.getElementById("viewRawButton");
  let startReviewButton = document.createElementNS(HTML_NS, "button");
  startReviewButton.textContent = "Review Patch";
  startReviewButton.setAttribute("onclick", "return false;");
  startReviewButton.id = "startReviewButton";
  
  viewRawButton.parentNode.appendChild(startReviewButton);
  startReviewButton.addEventListener("click", startReview, false);
  
  let doneReviewButton = document.createElementNS(HTML_NS, "button");
  doneReviewButton.textContent = "Review Complete";
  doneReviewButton.setAttribute("onclick", "return false;");
  viewRawButton.parentNode.appendChild(doneReviewButton);
  doneReviewButton.addEventListener("click", doneReview, false);
  doneReviewButton.id = "doneReviewButton";
  
}

})();
