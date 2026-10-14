const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'website', 'legal-footer.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'website', 'legal-footer.css'), 'utf8');

function expectIncludes(source, fragment, message) {
  if (!source.includes(fragment)) throw new Error(message);
}

expectIncludes(script, 'const syncMobileMenuPosition = () =>', 'Meniul nu își sincronizează poziția cu navbarul.');
expectIncludes(script, 'innerHeight - headerBox.bottom - 16', 'Înălțimea meniului nu pornește de sub navbar.');
expectIncludes(script, "--gt-mobile-menu-max-height", 'Înălțimea disponibilă a meniului nu este calculată din viewport.');
expectIncludes(script, "g-trots:promotions-viewed", 'Meniul nu reacționează la apariția barei de promoții.');
expectIncludes(styles, 'top: calc(100% + 0.5rem) !important', 'Meniul nu este ancorat direct sub navbar.');
expectIncludes(styles, 'max-height: var(--gt-mobile-menu-max-height', 'CSS-ul nu limitează meniul la spațiul vizibil.');
expectIncludes(styles, 'min-height: 3.35rem', 'Linkurile meniului nu au fost compactate.');

console.log('mobile_navbar_menu_layout_test: OK');
