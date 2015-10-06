# Editable

Rich text editor **with no contentEditable** and **no dependency on browser selection or ranges**.

<a href="https://cdn.rawgit.com/tonioloewald/editor2/master/index.html">Click here for a demo</a>

Having written a pretty robust rich text editor based on contentEditable/getSelection and then seen it have horrific 
performance issues with recent versions of IE, and even more horrific accessibility issues everywhere, and weird
compatibility issues even on the most modern browsers, I came to the conclusion that what the world really needed
was an open source rich text editor that doesn't use contenteditable, getSelection, or any of that useless crap.

And (aside from when I add PASTE support) it does not and will not use any contenteditable properties.

## Dependencies

I'm using jQuery.

## Current State

Supports basic editing functionality, including bold and italic buttons and paragraph styles.

## Current Issues

* I'm still restoring some of the functionality I had when I still used the browser selection APIs.
* I have a brilliant plan for implementing mobile support, but it's not a priority right at this moment.

## Short-Term Goals

* Character-styling buttons should work completely.
* All tools implemented as plugins.
* Forward-delete, arrow keys (up and down are non-trivial, but I have a plan), home and end keys implemented
* Modifier keys such as option (to jump words) and shift (to extend selections) implemented

## Goals

* All basic editing functionality (i.e. arrow keys, short-arrow keys, forward delete, and so forth)
* Minimize reliance on DOM selection APIs (which suck almost as much as contenteditable) **DONE!**
* Feature parity with my existing editor (editor.js)
* Plugin Support
* Refactor most existing functionality as plugins
* Extremely simple to customize UI (with support for menus, etc.)
* Keep performance very, very lean
