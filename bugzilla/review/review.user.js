// ==UserScript==
// @name           bugzilla review
// @namespace      https://github.com/mook/greasemonkey-scripts/bugzilla
// @description    Review editor for bugzilla
// @include        */attachment.cgi?id=*&action=edit
// @require        String.js
// @resource       REVIEW_CSS Review.css
// ==/UserScript==
// vim: set sw=2 syntax=javascript : */

/**
 * Constants
 */

const HTML_NS = "http://www.w3.org/1999/xhtml";

var location = { __proto__ : window.location };

/**
 * Function to start the review, triggered by the user-visible button
 */
function startReview() {
  document.documentElement.setAttribute("reviewing", true);
  var diffFrame = document.getElementById("viewDiffFrame");
  diffFrame.src = "attachment.cgi?id=" + location.attachmentid +
                  "&action=diff&headers=0";
  diffFrame.addEventListener("load", onDiffLoad, false);

  var reviewFrame = document.getElementById("reviewFrame");
  if (reviewFrame) {
    return;
  }
  reviewFrame = document.createElementNS(HTML_NS, "section");
  document.querySelector(".attachment_info").appendChild(reviewFrame);
  reviewFrame.id = "reviewFrame";
  reviewFrame.classList.add("review");
}

/**
 * Callback when the diff view has been loaded; this is responsible for filling
 * out the sections
 */
function onDiffLoad(event) {
  var reviewFrame = document.getElementById("reviewFrame");
  var doc = event.target.contentDocument;
  alert(doc.body.innerHTML);
  reviewFrame.scrollIntoView();
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
  
  viewRawButton.parentNode.appendChild(startReviewButton);
  startReviewButton.addEventListener("click", startReview, false);
}

})();
