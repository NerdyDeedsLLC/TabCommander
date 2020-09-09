console.clear();
const EXTENSION_DEBUG_MODE = true;
if(!EXTENSION_DEBUG_MODE) console.log = ()=>{};

(() => {
    class _TCEXT {
        // %%%%%%%%%%%%%%%%%%%%%%%% //
        // %% CLASS CONSTRUCTION %% //
        // %%%%%%%%%%%%%%%%%%%%%%%% //
        constructor() {
            this.omniboxListeners = false;
            this.supportedModChar = ['\/', '\!', '\=', '\#'];
            this.actionASCIIicons = {
                'Isolate'       : '⬒⬓ ⇉ ⬒⬓⬒ ⇉ ⧆        ',
                'Extract'       : '🀱🀱🀰🀱🀰🀱 ⥅ ⧆   ',
                'Merge'         : '🀱🀰 ⥅ ⊡ ⥆ 🀰🀱      ',
                'Sort'          : '🀱⤻🀹⤻🁉⤻🁡⤻🀰     ',
                'Discard'       : '🀱🀱🀱🀱🀰🀰⤼✘      ',
                'Segregate'     : '⧆ ⇇ 🁡🀰🀱 ⇉ ⧆      ',
                'Unify'         : '🀰🀰↣ ⊡ ↢🀰🀰        ',
            }
            this.supportedActions = {
                'Isolate'       : 'MOVE ALL %%totMatchCount%% matching tabs from ALL %%totWindowCount%% WINDOWS to a NEW WINDOW',
                'Extract'       : 'MOVE ALL %%curWinMatchCount%% matching tabs from THE CURRENT WINDOW to a NEW WINDOW',
                'Merge'         : 'MERGE ALL %%totMatchCount%% matching tabs from ALL %%totWindowCount%% open windows INTO THIS ONE',
                'Sort'          : 'SORT all %%curWinMatchCount%% tabs in the CURRENT WINDOW, first by Domain, then by Title',
                'Discard'       : 'CLOSE ALL %%totMatchCount%% matching tabs from ALL %%totWindowCount%% open windows',
                'Segregate'     : 'CREATE %%segDomainCount%% NEW WINDOWS, one for EACH DOMAIN, populated with its RESPECTIVE TABS, **REGARDLESS OF SEARCH QUERY** !',
                'Unify'         : 'MERGE ALL %%totTabCount%% tabs into THE CURRENT WINDOW, **REGARDLESS OF SEARCH QUERY** !'
            }
            this.setBaseState()
            this.gatherWindowAndTabState();
            console.log = console.log.bind(this);
        }

        setBaseState() {
            this.activeWindowID   = -1;
            this.windows          = [];
            this.tabs             = [];
            this.currWinTabCount  = 0;
            this.allFilteredTabs  = [];
            this.winFilteredTabs  = [];
            this.uniqueDomainSet  = [];
            this.rawUserInput     = '';
            this.userSelAction    = '';
            this.parsedTextInput  = '';
            this.userInputIcons   = '';
            this.userInputRegEx   = null;
            this.invertResults    = false;
            this.uniqueResults    = false;
            this.caseSensitiveRE  = false;
            this.previousQuery    = '';
            this.previousAction   = '';
        }
        // @@@@@@@@@@@@@@@@@@@@@@@@@@ //
        // @@ PRIV UTILITY METHODS @@ //
        // @@@@@@@@@@@@@@@@@@@@@@@@@@ //
        
        regExDomainFromStr(s,r=/.*(https?\:\/\/.+?\/).*/i) { 
            return r.test(s) ? s.replace(r, '$1').split(/\.|^.*?\/\//g).slice(-2).join('.') : !1; 
        }                                      // @ Extracts a http/https url (protocol, subdomain, domain, and extension) from the input string @ //

        regExcludeChromeURLs(s,r=/^.*(?:chrome(?:-extension)?\:\/\/.*?)(https?\:\/\/.*)?$/i){ return s.replace(r, '$1'); }                      // @ Strips chrome:// & chrome-extension:// prefixed urls, returning the real ones (to play nice w/ other extensions) @ //
        
        sortJSONObjByProperty(o,p,c,u=v=>c?v:(v?v.toUpperCase():'')){ return o.sort((a,b,x=u(a[p]),y=u(b[p]))=>1+~~(y<x)+~(y>x)); }                    // @ Sorts a JSON object (case-sensitivity optional) by the specified property @ //
        
        clearExtensionIconBadge(){ return Promise.resolve(this.setExtensionIconBadge()); }                                                      // @ Clears/resets the extension's icon badge's text and background color @ //
        
        setExtensionIconBadge(text='',...bgcolor){                                                                                              // @ Sets the extension's icon badge's text and background color @ //
            bgcolor=((bgcolor && Array.isArray(bgcolor[0])) ? bgcolor.pop() : bgcolor) || [];
            bgcolor = [...bgcolor, ...new Array(4).fill(0)].splice(0,4)
            chrome.browserAction.setBadgeText({text:text}, ()=>{})
            chrome.browserAction.setBadgeBackgroundColor({color:bgcolor}, ()=>{})
        }

        // ############################ //
        // ## CORE EXTENSION METHODS ## //
        // ############################ //
        
        /*
        # Gathers and indexes all the currently-open windows and their child tabs
        */
        gatherWindowAndTabState() {
            this.setBaseState();
            this.clearExtensionIconBadge();
    
            return new Promise((resolve, reject)=>{                                                                                             // # Gonna return this all promisey-like to ensure order of operations: # //
                const seedWindows = () => {                                                                                                         // ...# First, gather all the open/accessible Chrome windows & store each in the class object: # //
                    // this.windows = [];
                    chrome.windows.getAll({populate:true, windowTypes:['normal','popup']}, (windows)=>{                                                 // (# Scoop up all the active, accessible Normal and Popup Windows... ) #//
                        [...windows].forEach(win=>
                            this.windows.push(Object.assign({}, {_id:win.id,tabCt:win.tabs.length,tabIDs:win.tabs.map(tab=>tab.id)}, win))              // (# ...and iteratively add them to the class object, adding helpful shortcut data to each #) //
                        );
                        seedTabs(this.windows);
                    });
                }
                
                const seedTabs = () => {                                                                                                            // ...# then, iterate the tabs from seedWindows, reduce the dataset, & parse out unique domains... # //
                    let uniqueDomains = [], activeWindowID = this.activeWindowID;
                    this.tabs = Object.values(this.windows.flatMap(w=>w.tabs)).map(tab=>{
                        uniqueDomains.push((tab.domain = this.regExDomainFromStr(tab.url)));
                        return Object.assign({}, {
                            'id'       : tab.id, 
                            'title'    : tab.title,
                            'windowId' : tab.windowId,
                            'activeWin': +(tab.windowId === this.activeWindowID),
                            'index'    : +tab.index,
                            'active'   : +tab.active,
                            'selected' : +tab.selected,
                            'url'      : this.regExcludeChromeURLs(tab.url), 
                            'domain'   : tab.domain,
                            'status'   : tab.status
                        })
                    });                                                                         // (# Starting with the tabs object the Chrome API provided... #) //
                    this.uniqueDomainSet = uniqueDomains.filter((val, ind, self) => self.indexOf(val) === ind); // (# ...a create a new collection of only their respective domains, then filter out duplicates. #) //
                    setListeners();
                }
                
                const setListeners = () => {                                                                                                        // ...# finally, set the event listeners on the OmniBar (assuming they've not been already set)... # //
                    if(!this.omniboxListeners){
                        chrome.omnibox.onInputChanged.addListener(  (text, CAPI_genSuggestion) => this.filterTabs(text, CAPI_genSuggestion));           // (# Set the Omnibar's onChange/onInput event... #) //
                        chrome.omnibox.onInputEntered.addListener(  (text)                     => this.handleMenuItemSelection(text));                  // (# ...as well as its onSubmit event... #) //
                        this.omniboxListeners = true;                                                                                                   // (# ...then bit-flip a flag to indicate they've been so set (i.e. don't set 'em again). # //
                    }
                    resolve(this);                                                                                                                  // ...# and conclude the promise. # //
                }
                
                chrome.windows.getLastFocused(null, cw=>this.activeWindowID = cw.id);                                                                // # Grab the currently-selected window's ID... # //
                seedWindows();                                                                                                                      // ...# then trigger the promise described above. # //
            });
        }

        /*
        #   Tests to see if a given character (needle) is both A: supported as a valid modifier flag, and B: located (along with any other possible optional flags at the START of the query.
        #   Should any of these characters appear AFTER this specialized "prefix zone" they are evaluated as their normal selves.
        #   @param      [String]     needle      The character being sought. Valid inputs include: "", "/", "!", "=", and "#".
        #   @param      [String]     haystack    The entirety of the search query to be parsed at searched for the characters in question
        #   @returns    [Boolean]                true/false value indicating whether or not the character was present in the query's "prefix zone"
        */
        startGroupingTest = (needle='', haystack) => {
            let remainingModChars = this.supportedModChar.join('').replace(`\\${needle}`, '');  // (# Concatinate all supported flag characters, then remove needle from the result... #) //
            let startGroupTestRE  = new RegExp(`^[${remainingModChars}]*${needle}`);            // (# ...then test for needle in haystack, optionally permitting only supported flag characters to prefix it.  #) //
            return startGroupTestRE.test(haystack);
        }
    
        /*
        #   Performs the regex filtration itself
        #   @param  [String]     filterString                The user input from the Omnibar containing the search criteria we'll use to filter down the array of tabs stored in the class object
        #   @param  [Function]   CAPI_displaySuggestion   Name representing the callback method that's being automatically provided via the Chrome extension API (just passed along to generateMenu, below)
        */
        filterTabs(filterString, CAPI_displaySuggestion) {
            
            let qtMods = [];

            // ## PROMISARY CHAIN ##//
            return this.gatherWindowAndTabState()                                                                                               // # Initiate the promisary chain, starting with gathering the current "state" of the Chrome instance... # //

            .then(() => {                                                                                                                       // # Retrieve previous call from Chrome API Sync Storage for use as the default menu action
                return this.retrieveData(['previousAction', 'previousQuery'], '');
            })
            
            .then(() => {                                                                                                                       // # ...next, parse the user's input to ascertain what "flavor" of a regex search are we conducting: # //
                this.rawUserInput  = filterString;                                      // (# Store a copy of the original search text (in case this is a pure RegEx query )
                this.invertResults = /^!!/.test(filterString);                          // (# Test to see if the results should be inverted right off the bat )
                filterString       = filterString.replace(/^!!/,'')                     // (# Strip the leading !! inversion-indicator (we already stored it); it'll confuse the Exclusion flag )
                
                this.uniqueResults = this.startGroupingTest('#', filterString);         // (# Test to see if we're returning unique results only )
                filterString = filterString.replace(/^\\|(?<! )([\\#])|[\(\)]/g, '')    // (# Strip: first-char backslashes, prefix grouping octocets, ALL parentheses... )
                                           .replace(/\|{2,}/g, '|')                     // (# ... then convert any logical OR's (||) to RegEx OR's (|)... )
                                           .replace(/"/gim, "\\b")                      // (# ... and finally replace all double-quotes (") with RegEx word delimiters (\b), since neither Title nor URL should have 'em )
                this.parsedTextInput = filterString;
                
            
                // ## ACTION EVALUATION ##  //
                if(this.rawUserInput.charAt(0) === '/'){                                                                                                // #  1. Is the input to be evaluated UNCHANGED, as a LITERAL REGULAR EXPRESSION?    [[[  TRIGGER: / @ char(0) ]]]  # //
                    qtMods.push('®');
                    this.rawUserInput.replace(/(?<=^)(?:\/)?(.*?)\/?(?:(?<=\/)([gim]*))?$/g, (...m)=>this.userInputRegEx = new RegExp(m[1], m[2]||'')); // (# Strip the first/last char if either/both are slashes, and tack on whatever flags follow the final /, if present

                }else{                                                                                                                                  // ...#   === OR, if NOT a Literal Expressions (those being incompatable with ALL OTHER FLAGS)... ===   #... //

                    if(this.invertResults)      qtMods.push('▷◀︎');                                                                                      // #   2a. Are the results INVERTED?    [[[ TRIGGER: !! at START of string ]]]  # //
                    
                    else if(this.uniqueResults) qtMods.push('1️⃣');                                                                                      // #   OR 2b. Return ONLY UNIQUE matches (Which is INCOMPATABLE with INVERSION)?    [[[  TRIGGER: #  ]]]  # //

                    if(/\|/.test(filterString)) qtMods.push('➕');                                                                                      // #   3. Are there MULTIPLE SEARCH CONDITIONS?    [[[  TRIGGER: | in ANY POSITION  ]]]  #//

                    if(/"/.test(filterString))  qtMods.push('❞');                                                                                       // #   4. Return only WHOLE-WORD matches?    [[[  TRIGGER: "" WRAPPING A WORD  ]]]  # //
                        
                    if(this.startGroupingTest('', filterString)){
                        if(this.startGroupingTest('=', filterString)){                                                                                  // #    and/or 5. Return only CASE-SENSITIVE matches?   [[[ TRIGGER: =  ]]]  # //
                            qtMods.push('🔤');
                            this.caseSensitiveRE = true;
                        }
                        if(this.startGroupingTest('!', filterString)){                                                                                  // #    and/or 6. Treat search terms as EXCLUSIONS?   [[[  TRIGGER: !  ]]]  # //
                            // &    ENHANCEMENT: adjust so bangs (!) are accepted from start grouping    && //
                            // &    & ALSO following a logical "or" (|) to allow for mixed conditions    && //
                            qtMods.push('❗️');
                            filterString = `^((?!(?:${filterString})).)*$`; 
                        }else 
                            qtMods.push('🔍');
                    
                        this.userInputRegEx = new RegExp(filterString, this.caseSensitiveRE ? '' : 'i');

                    }else {                                                                                                                             // #    OR 7. NONE of the above; just run a vanilla INCLUSIVE search?   [[[  TRIGGER: DEFAULT BEHAVIOR  ]]]  # //
                        qtMods.push('🔍')
                        this.userInputRegEx   = new RegExp(filterString, 'i');
                    }
                }

                                                                                                                                                        // #    Now FIND OUT MATCHES!    # //
                this.userInputIcons = qtMods.join('');                                                                                                       // ...# Join all the ASCII icons (*SIGH* fine: they're "emoji". Ew.) into one string... #) //
                let userRE      = this.userInputRegEx,
                    currWinTabs = 0,
                    isInCurrWin = false;
                console.log('userRE :', userRE);
                
                this.tabs.forEach(tab=>{                                                                                                                // ...# filter out the tabs that match the constructed Regular Expression... #) //
                    isInCurrWin = false;
                    if(tab.windowId === this.activeWindowID) {
                        isInCurrWin = true;
                        currWinTabs++;
                    }
                    if  (((userRE.test(tab.title) || userRE.test(tab.url)) === !this.invertResults) &&                 // (# ...by testing if either the URL or the title match (or don't match, if an inversion)... #) //
                        (!this.uniqueResults || !!this.allFilteredTabs.filter(ft=>ft.url === tab.url).length)) {       // (# ...then by excluding any matches whose URL's are duplicates (if that flag's set)... #) //
                            this.allFilteredTabs.push(tab);                                                            // (# ...and shoving them into a collection inside the class. #) //
                            if(isInCurrWin) this.winFilteredTabs.push(tab);                                            // (# ...if it happens to be in the currently-active window, add it to that collection, too. #) //
                        }
                });
                this.currWinTabCount = currWinTabs;
                console.log('allFilteredTabs: ', this.allFilteredTabs, '(', this.allFilteredTabs.length, '/', this.tabs.length + ')');
                console.log('winFilteredTabs: ',this.winFilteredTabs, '(', this.allFilteredTabs.length, '/', this.currWinTabCount + ')');
                return;
            })

                
            .then(()=>this.generateMenu(CAPI_displaySuggestion, console.log(Object.assign({},this))));                                                  // #    Finally, generate and display the menu of actions to the user    # //
        }
        

        // $$$$$$$$$$$$$$$$$$$$$$$$$$$$$#$$$$$$$$$$$$ //
        // $$   MENU AND MENU-SELECTIONS ACTIONS   $$ //
        // $$$$$$$$$$$$$$$$$$$$$$##########$$$$$$$$$$ //

        /*
        $   Generate the menu of suggestions inside the omnibar dropdown for the user to select from
        $   @param  [Function]  CAPI_displaySuggestion   Name representing the callback method that's being automatically provided via the Chrome extension API
        */
        generateMenu(CAPI_displaySuggestion) {
            const buildMenuItem = (keyword, matchCount, twCountData, condition=false) => {
                if(!condition) return false;
                let menuObj = {};
                menuObj.content     = `${keyword} ${matchCount} matching tabs.`
                menuObj.description = this.actionASCIIicons[keyword] + ' [' + keyword.toUpperCase() + '] ' + this.supportedActions[keyword].replace(/%%(.+?)%%/g, (...m) => twCountData[m[1]]);
                omniBarMenuOutput.push(menuObj);
            }

            var omniBarMenuOutput = [],
                twCountData = {
                    totTabCount          : this.tabs.length,
                    currWinTabCount      : this.currWinTabCount,
                    totWindowCount       : this.windows.length,
                    matches              : this.allFilteredTabs,
                    totMatchCount        : this.allFilteredTabs.length,
                    curWinMatchCount     : this.winFilteredTabs.length,
                    segDomainCount       : this.uniqueDomainSet.length
                },
                defSuggestionText    = (twCountData.totMatchCount < 1 || this.rawUserInput === '') 
                ? "0 matching tabs. Refine your expression (or press ESC to abort)."
                : `${this.userInputIcons + this.allFilteredTabs.length} matching tabs. Select action below (or Enter ${
                    ((this.previousQuery === '') 
                    ? 'for the default action [ISOLATE]' 
                    : 'to repeat previous query: ' + this.previousQuery)
                })`;
                
            console.log('twCountData :', twCountData);
            buildMenuItem("Isolate",   twCountData.totMatchCount,    twCountData, (!!twCountData.totMatchCount));
            buildMenuItem("Extract",   twCountData.curWinMatchCount, twCountData, (!!twCountData.curWinMatchCount));
            buildMenuItem("Merge",     twCountData.curWinMatchCount, twCountData, (twCountData.totMatchCount > twCountData.curWinMatchCount));
            buildMenuItem("Sort",      twCountData.currWinTabCount,  twCountData, (twCountData.currWinTabCount > 1));
            buildMenuItem("Discard",   twCountData.totMatchCount,    twCountData, (!!twCountData.totMatchCount));
            buildMenuItem("Segregate", twCountData.segDomainCount,   twCountData, (twCountData.segDomainCount > 1));
            buildMenuItem("Unify",     twCountData.totTabCount,      twCountData, (twCountData.totWindowCount > 1));

            chrome.omnibox.setDefaultSuggestion({description:defSuggestionText})
            
            if(twCountData.totMatchCount > 0) {
                this.setExtensionIconBadge( (twCountData.totMatchCount === twCountData.totTabCount) 
                                                ? "ALL" 
                                                : `${twCountData.totMatchCount}/${twCountData.totTabCount}`,
                                            [Math.round((twCountData.totMatchCount/twCountData.totTabCount) * 100),100,0,255])
            }else this.setExtensionIconBadge('NONE', 100,100,100,255);
            CAPI_displaySuggestion(omniBarMenuOutput);
        }

        failAction(errType) {
            const errMsgs = {
                'EMPTY_QUERY': 'ERROR: BAD INPUT!\n No search criteria were provided after activating Tab Commander!',
                'NO_RESULTS': 'ERROR: NO MATCHES FOUND!\n Tab Commander found no tabs matching your search criteria!',
                'NO_RESULTS_FOR_ACTION': 'ERROR: NO MATCHES FOUND FOR THIS ACTION!\n Tab Commander found no matches to your query that would work with that action!',
                'LONE_DOMAIN': 'ERROR: NO MATCHES FOUND FOR THIS ACTION!\n All currently-open tabs are from the SAME domain already!',
                'LONE_WINDOW': 'ERROR: NO MATCHES FOUND FOR THIS ACTION!\n All currently-open tabs are already IN the same window!',
            }
            this.setExtensionIconBadge('HELP', 255,0,0,255);
            alert(errMsgs[errType] + '\n\n(Hint: click Tab Commander\'s extension icon for help!)');
            return false;
        }


        /*
        $   // $$ CONTROLLER $$ //
        $   Verifies both the user's input and their selection, then triggers the appropriate command
        $   @param  [String]  text   Name representing the callback method that's being automatically provided via the Chrome extension API
        */
        handleMenuItemSelection(text) {
            console.log(this.suggest);

            this.clearExtensionIconBadge();
            var action;
            if(text === this.parsedTextInput || text ===''){                                    // ...$ IF the text matches, it means the user clicked on the "default behavior" menu listing, meaning... $ //
                if(this.previousAction){                                                        //   ($ IF there was a previous action/query already stored... $) //
                    this.userSelAction = this.previousAction;                                   //   ($ ... we're going to be using that one, regardless of what the current text in the... $) //
                    console.log('Rerunning previous query! ', this.previousQuery, this.userSelAction);
                    return this.filterTabs(this.previousQuery, this[this.previousAction]);       //   ($ ... and re-run the filtration with the new values in place. $) //
                }else action = ['ISOLATE'];                                                 //   ($ OTHERWISE if there is NO previous query (first time running one, ever) default it to Isolate. $) //
            }else                                                                               // ...$ ALTERNATIVELY, if there is NO text match, the user clicked/hit enter on a menu item... $ //
                action = text.split(' ');                                                       //   ($ ... so parse the string to discover which (the first word is all that matters. S'cool if there's >1 space) $) //
            if( !Array.isArray(action) || !(action=action[0].toLowerCase())) return false;      // ...$ Verify that indeed an action was chosen, and parse out (in lowercase) the string name of the function to trigger $ //
            this.userSelAction = action;
            this.retainLastQuery();
            return this[action]();                                                              // ...$ Call the appropriate function for the action selected as defined below $ //
        };

        /*
        $    Creates a NEW WINDOW and MOVES ALL MATCHING TABS from ALL WINDOWS
        */
        isolate() {
            let matches = this.allFilteredTabs.map(tab=>tab.id);
            if(matches == null || matches.length === 0) return this.failAction('NO_RESULTS');
            console.log('ATTEMPTING TO ISOLATE ' + matches.length + ' TABS!\n   ', matches);
            chrome.windows.create( {type: "normal"}, function( win ) {
                var newWindow = win;
                chrome.tabs.move( matches, { windowId: newWindow.id, index: -1 }, function( tabs ) {})
                chrome.tabs.remove( newWindow.tabs[newWindow.tabs.length - 1].id );
            });
        }
        
        /*
        $    Creates a NEW WINDOW and MOVES ALL MATCHING TABS from ACTIVE WINDOW to it
        */
        extract() {
            let matches =   this.winFilteredTabs.map(tab=>tab.id);
            if(matches == null || matches.length === 0) return this.failAction('NO_RESULTS_FOR_ACTION');
            console.log('ATTEMPTING TO EXTRACT ' + matches.length + ' TABS!\n   ', matches);
            chrome.windows.create( {type: "normal"}, function( win ) {
                var newWindow = win;
                chrome.tabs.move( matches, { windowId: newWindow.id, index: -1 }, function( tabs ) {})
                chrome.tabs.remove( newWindow.tabs[newWindow.tabs.length - 1].id );
            });
        }

        /*
        $    Simply alerts all matching tabs. May replace this before release
        */
       list() {
            let alertOutput = 'TABS MATCHING CURRENT QUERY:\n  - ',
                matches = this.allFilteredTabs.map(match=>{let domain = this.regExDomainFromStr(match.url); return domain ? match.title + ' (' + domain + ')' : '';});
            if(matches == null || matches.length === 0) return this.failAction('NO_RESULTS');

            console.log('ATTEMPTING TO LIST ' + matches.length + ' TABS!\n   ', matches);
            alert(alertOutput + matches.join('\n  - '))
        }
    
        /*
        $    Reorders the tabs, first by domain, then by title
        */
        sort() {
            const ordTab = (arr)=>{
                let tab = arr.shift();
                console.log(arr, tab)
                chrome.tabs.move(tab.id, {index:0}, ()=>arr.length > 1 ? ordTab(arr) : false);
            }

            let matches = this.tabs.filter(tab=>tab.activeWin);
            console.log('ATTEMPTING TO SORT ' + matches.length + ' TABS!\n   ', matches);
            this.sortJSONObjByProperty(matches, 'title');
            this.sortJSONObjByProperty(matches, 'domain');
            console.log('matches :', matches);
            ordTab([...matches.reverse()])
        }
        
   /*
        $    GATHERS ALL MATCHING TABS from ALL WINDOWS into the ACTIVE WINDOW
        */
        merge() {
            let matches = this.allFilteredTabs.map(tab=>tab.id);
            if(matches == null || matches.length === 0) return this.failAction('NO_RESULTS');
            if(this.windows.length < 2) return this.failAction('LONE_WINDOW');
            console.log('ATTEMPTING TO MERGE ' + matches.length + ' TABS!\n   ', matches);
            chrome.tabs.move(matches, {windowId: this.activeWindowID, index:-1});
        }
            
        /*
        $    CLOSES ALL MATCHING TABS from ALL WINDOWS
        */
        discard() {
            let matches = this.allFilteredTabs.map(tab=>tab.id);
            if(matches == null || matches.length === 0) return this.failAction('NO_RESULTS');
            if(!confirm ("Close " + matches.length + " tabs?")) return false;
            console.log('ATTEMPTING TO DISCARD ' + matches.length + ' TABS!\n   ', matches);
            chrome.tabs.remove( matches, ()=>{});
        }
        
        /*
        $    Creates a NEW WINDOW for EACH DOMAIN the moves ALL TABS from ALL WINDOWS to each, respectively, REGARDLESS OF MATCH STATUS
        */
        segregate() {
            let allTabs = [...this.tabs],
                domainLists = {};
            
            if(this.uniqueDomainSet == null || this.uniqueDomainSet.length < 2) return this.failAction('LONE_DOMAIN');
            this.uniqueDomainSet.forEach(domain=>domainLists[domain] = []);
            allTabs.forEach((tab,i,url=this.regExDomainFromStr(tab.url))=>url?domainLists[url].push(tab.id):'');
            
            domainLists.forEach(tabsForDomain=>{
                console.log('ATTEMPTING TO SEGREGATE ' + tabsForDomain.length + ' TABS!\n   ', tabsForDomain);
                chrome.windows.create( {type: "normal"}, ( win ) => {
                    var newWindow = win;
                    chrome.tabs.move( tabsForDomain, { windowId: newWindow.id, index: -1 }, ()=>{})
                    chrome.tabs.remove( newWindow.tabs[newWindow.tabs.length - 1].id );
                });
            })
            this.windows.forEach(win=>chrome.windows.remove(win.id));
        }
        
        /*
        $    Moves all tabs from all windows into the currently-active one, REGARDLESS OF MATCH STATUS
        */
        unify() {
            if(this.windows.length < 2) return this.failAction('LONE_WINDOW');
            let matches = this.tabs.map(tab=>tab.id);
            console.log('ATTEMPTING TO UNIFY ' + matches.length + ' TABS!\n   ', matches);
            chrome.tabs.move(matches, {windowId: this.activeWindowID, index:-1});
        }

        // %%%%%%%%%%%%%%%%%%%%%%%% //
        // %% REMOTE DATA STORAGE %%//
        // %%%%%%%%%%%%%%%%%%%%%%%% //
        /*
        %   WRITES a value or values to Chrome's remote synchronized storage API
        %   @param  [String]  action        The action chosen by the user to be carried out on the current set of query matches
        %   @param  [String]  query         The query run to generate the current set of matches
        %   @param  [String]  addlJSONkvps  Any additional key-value-pairs to be stored/retained.
        */
        retainLastQuery(action=this.userSelAction, query=this.rawUserInput, ...addlJSONkvps){
            if(!addlJSONkvps || typeof(addlJSONkvps) !== 'object') addlJSONkvps = {};
            chrome.storage.sync.set(
                Object.assign({'previousAction': action, 'previousQuery': query}, addlJSONkvps), 
                ()=>console.log('Settings saved:', action, query)
            );
        }

        /*
        %   READS a value or values from Chrome's remote synchronized storage API, optionally sets it/them (or, if undefined, an optionally-set 
        %   equivalent default value(s)) to a specified object, then returns a JSON object cotain the key-value-pair(s) requested.
        %   @param    [String/Array]  keysToRetieve   Either a string name of a value to retrieve, or an array of multiple string names of values to retrieve
        %   @param    [String/Array]  defaultValues   Either a string or array of values to be used if nothing is present in the sync storage. If fewer values are provided than there are  
        %                                             parameters in keysToRetieve, they will be backfilled by defaultValues's value (if a string) or the value of it's first index (if an array)
        %   @param    [Object]        targetObj       [OPTIONAL] The object to write the values to, in addition to returning them (defaults to extension's window scope)
        %   @returns  [Object]                        JSON object containing ALL keys requested and their retrieved values (or a default value if undefined and one was specified)
        */
        retrieveData(keysToRetieve, defaultValues=[], targetObj=this){
            return new Promise((resolve, reject) => {
                if(keysToRetieve == null) return null;
                keysToRetieve = [...[keysToRetieve]].flat();
                defaultValues = Object.assign(new Array(keysToRetieve.length).fill([...[defaultValues]].flat()[0]), [...[defaultValues]].flat());
                chrome.storage.sync.get([...keysToRetieve], resolve)
            }).then(data=>{
                if(data && (Object.keys(data).length <= 0)) return void(0);
                Object.assign(targetObj, (data = Object.fromEntries(keysToRetieve.map((key, i)=>[key, data[key] || defaultValues[i]]))));
                console.log('CHROME STORAGE-RETRIEVED DATA :', data);
                return data;
           });
        }
    }
    
    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! //
    // !! INITIALIZE CLASS OBJECT (FIRES ONCE PER PAGE LOAD) !! //
    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! //
    window._TCEXT = _TCEXT;
    window.TCEXT = new _TCEXT(); 
    console.log('TCEXT LOADED :', TCEXT);
})();