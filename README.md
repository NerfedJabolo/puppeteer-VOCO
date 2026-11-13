# Puppeteer – The Internet ülesanded

Automaattestid seitsmele ülesandele saidil <https://the-internet.herokuapp.com/>.

## Käivitamine

```bash
cd puppeteer-the-internet
npm test
```

Kui Chrome'i veel all pole:

```bash
npx puppeteer browsers install chrome
```

Skript kasutab projekti lokaalset Chrome'i cache'i (`.cache/puppeteer`) ning käivitab selle headless-režiimis. Konteinerikeskkonnas on Chromiumi sandbox välja lülitatud (`--no-sandbox`).

## Mida testitakse

| # | Leht | Kontroll |
|---|------|----------|
| 1 | `/abtest` | Loeb ja prindib `<h3>` pealkirja. |
| 2 | `/add_remove_elements/` | Lisab kaks korda elemendi, kontrollib 2 Delete-nuppu ja eemaldab ühe. |
| 3 | `/broken_images` | Loeb kõik `<img>` elemendid ja prindib katkiste piltide arvu. |
| 4 | `/checkboxes` | Märgib mõlemad kastid ja kontrollib nende olekut. |
| 5 | `/context_menu` | Paremklõps hot spot'il, loeb alert'i sõnumi ja vajutab OK. |
| 6 | `/disappearing_elements` | Loendab navigeerimismenüü elementide arvu. |
| 7 | `/dropdown` | Valib „Option 2“ ja kontrollib valitud väärtust. |

## Väljund

- Konsooli kirjutatakse iga sammu tulemus ja kokkuvõte.
- `artifacts/results.json` sisaldab struktureeritud tulemusi.
- `artifacts/NN-*.png` on iga ülesande lõppoleku screenshot.
- Kui mõni kontroll ebaõnnestub, loob skript `*-FAIL.png` screenshoti ja väljub koodiga 1.
