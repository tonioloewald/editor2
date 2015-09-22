# editor2

Rich text editor **with no contentEditable**.

Click here for a demo <a href="https://cdn.rawgit.com/tonioloewald/editor2/master/index.html">Demo</a>

Having written a pretty robust rich text editor based on contentEditable and then seen it have horrific performance
issues with recent versions of IE, and even more horrific accessibility issues everywhere, I came to the conclusion
that what the world really needed was an open source rich text editor that doesn't use contenteditable.

And (aside from when I add PASTE support) it does not and will not use any contenteditable properties.

## Dependencies

I'm using jQuery.

## Current State

Supports basic editing functionality, including bold and italic buttons (which don't yet react to the selection or allow
toggling-off) and paragraph styles (which work perfectly). Also supports basic annotations.

## Current Issues

This will totally fail on IE<=8, and fail in various ways on all browsers that aren't chrome for the time being. 
Browser compabilibility issues fall into two categories:

* Differences in selection API implementation (hence trying to minimize reliance on it)
* Issues with mobile browsers which don't recognize the editor and don't have keyboards, etc. (I'll need to think about that.)

## Short-Term Goals

* Character-styling buttons should work completely.
* All tools implemented as plugins
* Forward-delete, left and right arrow keys, home and end keys implemented
* Think about ways to implement up and down arrow keys (probably look at list of nodes and look where they are

## Goals

* All basic editing functionality (i.e. arrow keys, short-arrow keys, forward delete, and so forth)
* Minimize reliance on DOM selection APIs (which suck almost as much as contenteditable)
* Feature parity with my existing editor (editor.js)
* Plugin Support
* Refactor most existing functionality as plugins
* Extremely simple to customize UI (with support for menus, etc.)
* Keep performance very, very lean
