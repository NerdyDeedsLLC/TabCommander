console.clear();
let tocToggle = document.getElementById("toc"),
    answerNodes = document.querySelectorAll("dt");
document.documentElement.addEventListener("click", (e, trg = e.target) =>
    console.log(!/^toc/.test(trg.className) ? (tocToggle.checked = false) : "")
);

answerNodes.forEach((answer) => {
    console.log(answer);
    answer.addEventListener("click", (e, trg = e.target) => {
        console.log("HIT", trg);
        let currActive = document.querySelector("dt.active");
        if (currActive) {
            currActive.className = "";
            if (currActive === trg) return;
        }
        trg.className = "active";
        return false;
    })
});

window.addEventListener("load", () => {
    let toc = [];
    [...document.querySelectorAll("article > dl > dt > a")].forEach(
        (helpAnchor, index) =>
            (helpAnchor.name = "help-" + ("0" + index).slice(-2))
    );
    [...document.querySelectorAll("article > h1, article > h2, dl > dt")].forEach(
        (helpEntry) => {
            let strOP = "";
            if (/H\d/.test(helpEntry.tagName)) {
                toc.push(`<li class="helpnav-hdr">${helpEntry.innerText}</li>`);
            } else {
                let nodeNum = helpEntry
                    .querySelector("a")
                    .name.replace(/\D/gim, "");
                toc.push(
                    `<li class="helpnav-item" id="nav-item-${nodeNum}"><a href="#help-${nodeNum}" class="helpnav-item-link" id="nav-link-${nodeNum}">${helpEntry.innerText}</a></li>`
                );
            }
        }
    );
    document.querySelector(".helpnav").innerHTML = toc.join("");
});