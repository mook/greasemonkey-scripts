/* vim: set sw=2 syntax=javascript : */

String.prototype.trim = function String_trim()
  this.replace(/^\s+/m, '').replace(/\s+$/m, '');
