/* vim: set sw=2 syntax=js : */

/**
 * Converts a E4X XML / XMLList object into a DOM fragment
 */
function E4XtoDOM(aE4X) {
  var parser = new DOMParser;
  var text = "<root>" + aE4X.toXMLString() + "</root>";
  var doc = parser.parseFromString(text, "text/xml");
  var fragment = document.createDocumentFragment();
  while (doc.documentElement.firstChild) {
    fragment.appendChild(document.adoptNode(doc.documentElement.firstChild));
  }
  return fragment;
}
