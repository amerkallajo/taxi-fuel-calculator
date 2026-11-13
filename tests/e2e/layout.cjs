async function calculatorPanel(page, panel) {
  const tab = page.locator('#calculator-' + panel + '-tab');
  if (await tab.isVisible()) await tab.click();
}
module.exports = { calculatorPanel };
