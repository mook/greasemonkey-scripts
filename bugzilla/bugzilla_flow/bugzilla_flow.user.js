// ==UserScript==
// @name           bugzilla flow
// @namespace      https://github.com/mook/greasemonkey-scripts/bugzilla
// @description    embeds bug history in comment flow and other tweaks
// @include        */show_bug.cgi?*
// @require        sitePrefs.js
// @require        E4XtoDOM.js
// ==/UserScript==
// vim: set sw=2 : */

/**
 * Bugzilla Flow - inspired by Bugzilla Tweaks
 *
 * This script includes multiple possible steps; each step is pushed into an
 * array named "gSteps" and should be a function taking no arguments.  The name
 * of the function is used to determine if it should be run.
 */

const HTML_NS = 'http://www.w3.org/1999/xhtml';

var gSteps = [];

// Firefox 3.6 doesn't allow assignment to window.location; fake it out here
var location = { __proto__ : window.location };

gSteps.push(function InlineActivity() {
  // style things
  GM_addStyle(""+<><![CDATA[
    .bz_flow_entry {
      background-color: rgba(128, 128, 128, 0.15);
      padding: 0.1em 3ch;
      margin: 0 3ch;
      border: none;
    }
    .bz_flow_entry td {
      font-size: 0.8em;
      padding: 0.5em;
    }
    .bz_flow_entry .what {
      font-style: italic;
    }
    .bz_flow_entry .removed, .bz_flow_entry .added {
      font-family: monospace;
      font-size: 1.1em;
    }
    .bz_flow_entry {
      border-radius: 1em;
      margin-bottom: 1em;
    }
    .bz_comment .bz_flow_entry {
      padding: 0.25em 0.5em;
      margin-bottom: 0.1em;
    }
  ]]></>);
  // create a hidden iframe to load history in... :|
  var frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.src = location.root + "show_activity.cgi?id=" + location.params.id;
  frame.addEventListener("load", function() {
    var entries = [];
    var histRows = frame.contentDocument.querySelectorAll("table:not([id]) tr");
    // The history table is... purely for visual purposes; it's semantically
    // complete junk.  Munge them into changeset objects
    var changeset = null;
    Array.forEach(histRows, function(row) {
      if (row.querySelector("th")) return; //heading row
      let cells = Array.slice(row.getElementsByTagName("td"), 0);
      cells = cells.map(function(c) c.textContent.replace(/\s+$/m,'').
                                                  replace(/^\s+/m,''));
      if (cells.length == 5) {
        // new changeset
        if (changeset) {
          entries.push(changeset);
        }
        changeset = {
          who: cells.shift(),
          whenString: cells.shift(),
          changes: []
        };
        changeset.when = Date.parse(changeset.whenString.replace(/-/g, '/'));
      }
      if (cells.length != 3) {
        console.log("invalid number of cells in row: " + cells.length);
        return;
      }
      changeset.changes.push({
        what: cells[0],
        removed: cells[1],
        added: cells[2]
      });
    });
    if (changeset) {
      entries.push(changeset);
    }
    entries.sort(function(a, b) a.when - b.when);
    // and build elements for each changeset
    Array.forEach(entries, function(changeset) {
      // make a copy of changeset.changes so we can modify it
      var changes = Array.slice(changeset.changes);
      changeset.elem = E4XtoDOM(<>
          <table class="bz_flow_entry" xmlns={HTML_NS}>
            <tr>
              <td rowspan={changeset.changes.length} class="info">
                <span class="who">{changeset.who}</span>
                @
                <span class="when">{changeset.whenString}</span>
                :
              </td>
              <td class="action">
                <span class="what">{changes[0].what}</span>
                &#xA0;
                <span class="removed">{changes[0].removed}</span>
                →
                <span class="added">{changes[0].added}</span>
              </td>
            </tr>
          </table>
        </>).firstChild;
      // remove the first, embedded, change
      changes.shift();
      Array.forEach(changes, function(change) {
        changeset.elem.appendChild(E4XtoDOM(<>
            <tr xmlns={HTML_NS}>
              <td class="action">
                <span class="what">{change.what}</span>
                &#xA0;
                <span class="removed">{change.removed}</span>
                →
                <span class="added">{change.added}</span>
              </td>
            </tr>
          </>).firstChild);
      });
    });
    // we now have reasonable history with which to play with
    var lastComment = document.querySelector(".bz_comment:first-of-type").previousSibling;
    Array.forEach(document.getElementsByClassName("bz_comment"), function(comment) {
      if (entries.length < 1) {
        return;
      }
      let timeElem = comment.querySelector(".bz_comment_time");
      if (!timeElem) {
        timeElem = comment.querySelector("th + td > b");
        if (timeElem) timeElem = timeElem.nextSibling;
      }
      if (!timeElem) {
        // old bugzilla
        timeElem = comment.querySelector(".bz_comment_head a:last-of-type").
                           nextSibling;
      }
      let time = Date.parse(timeElem.textContent.
                                     replace(/\s+$/m, '').
                                     replace(/^\s+/m, '').
                                     replace(/-/g, '/'));
      while (entries.length > 0 && time > entries[0].when) {
        comment.parentNode.insertBefore(entries.shift().elem, comment);
      }
      while (entries.length > 0 && time == entries[0].when) {
        comment.appendChild(entries.shift().elem);
      }
      lastComment = comment;
    });
    for each (let entry in entries) {
      lastComment.parentNode.insertBefore(entry.elem, lastComment.nextSibling);
      lastComment = entry.elem;
    }
  }, false);
  document.body.appendChild(frame);
});

if(false)
gSteps.push(function Preferences() {
  var prefsContainer = E4XtoDOM(<>
    <form xmlns={HTML_NS} id="bz_flow_prefs">
      <h3>Bugzilla Flow Preferences</h3>
    </form>
  </>).firstChild;
  for each (let step in gSteps) {
    if (step == Preferences) {
      // never allow setting prefs on this step - we want to make sure we never
      // end up disabling prefs setting!
      continue;
    }
    var stepParams = E4XtoDOM(<>
      <input xmlns={HTML_NS} type="checkbox"
             id={"bz_flow_step_"+step.name}/>
      <label xmlns={HTML_NS} for={"bz_flow_step_"+step.name}>{step.name}</label>
    </>);
    
    stepParams.querySelector('[id="bz_flow_step_' + step.name+'"]').
             addEventListener("change", function(event) {
               if (!event.target.checked && !event.target.indeterminate) {
                 event.target.indeterminate = true;
                 event.target.checked = true;
               }
             }, false);

    prefsContainer.appendChild(stepParams);
  }
  document.body.appendChild(prefsContainer);

  // style the prefs pseudo-dialog
  GM_addStyle("" + <><![CDATA[
    #bz_flow_prefs {
      position: fixed;
      top: 20px;
      right: 20px;
      min-width: 300px;
      min-height: 200px;
      border: 1px solid black;
      background-color: cornsilk;
    }
    #bz_flow_prefs h3 {
      text-align: center;
    }
  ]]></>);
});

/**
 * Entry point for the main script
 */
(function main(){ /* wrapper to make komodo syntax checking happy */

  ///// make sure this is a bugzilla page
  if (!/^\?/(location.search)) return;
  location.params = location.search.
                             substr(1).
                             split('&').
                             reduce(function(obj, val) {
                               var k = val.split('=', 1)[0];
                               obj[k] = val.substr(k.length + 1);
                               return obj;
                             }, {});

  if (!("id/") in location.params) {
    // no bug number
    return;
  }

  if (!(document.body.classList.contains('bz_bug_' + location.params.id))) {
    // not a bug
    return;
  }

  ///// store the bugzilla instance root
  location.root = location.href.replace(/\/show_bug.cgi\?.*$/, '/');

  ///// run the steps
  for each (let step in gSteps) {
    if (!getPref("step_" + step.name, true)) {
      continue;
    }
    step();
  }
})();

