/* vim: set sw=2 syntax=javascript : */

// "NodeList" is undefined; find one somewhere and use that :(

document.querySelectorAll(":root").__proto__.__iterator__ =
  function NodeList__iterator__() {
    for (var i = 0; i < this.length; i++) yield this.item(i);
  };
