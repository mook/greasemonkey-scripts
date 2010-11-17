/* vim: set sw=2 syntax=js : */

/**
 * Set a preference value
 * @param aId the name of the preference
 * @param aValue the value to store
 * @param aIsGlobal if true, global to all bugzilla instances; by default, local
 */
function setPref(aId, aValue, aIsGlobal) {
  var key = btoa(aId);
  if (!aIsGlobal) {
    key += "_" + btoa(location.root);
  }
  GM_setValue(key, aValue);
}

/**
 * Get a preference value
 * @param aId the name of the preference
 * @param aDefault the default value if no value is found
 * @note This preferrs looking for a site-specific preference; if not found, a
 *       global preference is checked.  If that is missing as well, the default
 *       value as provided is used.
 */
function getPref(aId, aDefault) {
  var value = GM_getValue(btoa(aId) + "_" + btoa(location.root));
  if (typeof(value) != "undefined") return value;
  return GM_getValue(btoa(aId), aDefault);
}

