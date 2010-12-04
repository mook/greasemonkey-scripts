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
  setTimeout(function(){location.href="javascript:editAsComment()"}, 0);
  document.documentElement.setAttribute("reviewing", true);

  var reviewFrame = document.getElementById("reviewFrame");
  if (reviewFrame) {
    restoreComments();
    return;
  }

  var diffFrame = document.getElementById("viewDiffFrame");
  diffFrame.addEventListener("load", onDiffLoad, false);
  diffFrame.src = "attachment.cgi?id=" + location.attachmentid +
                  "&action=diff&headers=0";

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
  for each (let table in reviewFrame.querySelectorAll(".file_table")) {
    text.push("Index: " + decodeURIComponent(table.getAttribute("filename")));
    text.push((new Array(81)).join("="));
    for each (let row in table.querySelectorAll(".file > tr")) {
      if (row.querySelector(".section_head")) {
        // this is a diff hunk marker
        let lineStr = row.querySelector("th:first-of-type").textContent;
        lineStr = lineStr.split(/\n/)
                         .filter(function(s)/^\s*Line/(s))[0]
                         .trim();
        text.push("@" + lineStr + "@");
        continue;
      }
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
        let pre = row.querySelector("td:first-of-type pre");
        text.push("> -" + pre.textContent);
        doComment(pre);

        pre = row.querySelector("td:last-of-type pre");
        text.push("> +" + pre.textContent);
        doComment(pre);
      }
      else if (row.querySelector(".added")) {
        let pre = row.querySelector(".added pre");
        text.push("> +" + pre.textContent);
        doComment(pre);
      }
      else if (row.querySelector(".removed")) {
        let pre = row.querySelector(".removed pre");
        text.push("> -" + pre.textContent);
        doComment(pre);
      }
      else {
        /* no change */
        text.push(">  " + row.querySelector("pre").textContent);
        for each (let pre in row.querySelectorAll("pre")) {
          doComment(pre);
        }
      }
      
    }
  }

  editFrame.value = text.concat("").join("\n");
}

/**
 * Callback when the diff view has been loaded; this is responsible for filling
 * out the sections
 */
function onDiffLoad(event) {
  event.target.removeEventListener(event.type, arguments.callee, false);
  var reviewFrame = document.getElementById("reviewFrame");
  var doc = event.target.contentDocument;

  for each (let table in doc.querySelectorAll(".file_table")) {
    table = document.importNode(table, true);
    reviewFrame.appendChild(table);
    let filename = table.querySelector(".file_head input").getAttribute("name");
    table.setAttribute("filename", encodeURIComponent(filename));
    table.addEventListener("dblclick", onDiffDoubleClick, false);
    // remove all the links
    for each (let link in table.querySelectorAll("a[href]")) {
      link.parentNode.removeChild(link);
    }

    // add line numbers
    let lines = table.querySelectorAll("pre");
    for (let index = 0; index < lines.length; ++index) {
      lines[index].setAttribute("line_number", index);
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
    var match = /^review-(\d+)-file-(.*)-line-(\d+)/.exec(key);
    if (match && match[1] == location.attachmentid) {
      var table = reviewFrame.querySelector('.file_table[filename="' + match[2] + '"]');
      if (table) {
        updateComment(table, match[3]);
      }
    }
  }
  reviewFrame.scrollIntoView();
}

/**
 * update the comment display for a given line
 * @param aTable the file table to affect
 * @param aLineNumber the line number
 */
function updateComment(aTable, aLineNumber) {
  var key = "review-" + location.attachmentid +
            "-file-" + aTable.getAttribute("filename") +
            "-line-" + aLineNumber;
  var comment = localStorage.getItem(key);
  var preSelector = "pre[line_number='" + aLineNumber + "']";
  LOG(preSelector);
  var display = aTable.querySelector(preSelector + " + span.comment");
  if (comment) {
    if (!display) {
      display = document.createElementNS(HTML_NS, "span");
      display.classList.add("comment");
      let line = aTable.querySelector(preSelector);
      line.parentNode.insertBefore(display, line.nextSibling);
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
  if (target instanceof HTMLPreElement) {
    var editor = document.getElementById("reviewEditor");
    if (editor) {
      editor.blur();
    }

    var table = target;
    while (!table.classList.contains("file_table")) {
      table = table.parentNode;
    }
    var filename = table.getAttribute("filename");
    var key = "review-" + location.attachmentid +
              "-file-" + table.getAttribute("filename") +
              "-line-" + target.getAttribute("line_number");

    editor = document.createElementNS(HTML_NS, "textarea");
    editor.id = "reviewEditor";
    editor.setAttribute("line_number", target.getAttribute("line_number"));
    editor.value = localStorage.getItem(key) || "";
    target.parentNode.insertBefore(editor, target.nextSibling);
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
  var lineNumber = editor.getAttribute("line_number");

  var table = editor;
  while (!table.classList.contains("file_table")) {
    table = table.parentNode;
  }
  var filename = table.getAttribute("filename");

  LOG("save: " + filename + "@" + lineNumber + " <-- " + editor.value);
  
  var key = "review-" + location.attachmentid +
            "-file-" + filename +
            "-line-" + lineNumber;
  if (editor.value.length > 0) {
    localStorage.setItem(key, editor.value);
  }
  else {
    localStorage.removeItem(key);
  }

  editor.parentNode.removeChild(editor);
  updateComment(table, lineNumber);
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
