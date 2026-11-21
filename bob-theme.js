/* Bob English · giao diện ấm áp (kem · nâu đỏ · vàng) dùng chung cho mọi trang.
   Đổi bảng màu của Tailwind: xám → kem/nâu ấm, xanh dương/chàm → nâu đỏ. Giữ nguyên xanh lá/đỏ báo đúng sai. */
(function () {
  var warm = { 50: '#FFFAF1', 100: '#FDF3E3', 200: '#F3E5CF', 300: '#E5D2B8', 400: '#BFA791', 500: '#917A72', 600: '#705A55', 700: '#57413F', 800: '#3F2A2D', 900: '#2E1A1F', 950: '#1E0F13' };
  var maroon = { 50: '#FDF3F4', 100: '#FAE4E8', 200: '#F3C6CF', 300: '#E59DAC', 400: '#C8697E', 500: '#A33F58', 600: '#7E2A40', 700: '#66213A', 800: '#4B1D2B', 900: '#3A1521', 950: '#240B13' };
  var sun = { 50: '#FFFBEB', 100: '#FFF3C9', 200: '#FFE69A', 300: '#FFD45E', 400: '#FFC83D', 500: '#F5B014', 600: '#D98F06', 700: '#B36B09', 800: '#91530F', 900: '#774410', 950: '#452204' };
  var tw = window.tailwind = window.tailwind || {};
  var cfg = tw.config || {};
  cfg.theme = cfg.theme || {};
  var ext = cfg.theme.extend = cfg.theme.extend || {};
  var colors = ext.colors = ext.colors || {};
  ['slate', 'gray', 'zinc', 'neutral', 'stone'].forEach(function (k) { colors[k] = warm; });
  ['indigo', 'blue', 'sky'].forEach(function (k) { colors[k] = maroon; });
  colors.yellow = sun;
  colors.brand = maroon; colors.warm = warm; colors.sun = sun;
  colors.primary = maroon;
  if (colors.dark) colors.dark = { 700: '#46232C', 800: '#33171F', 900: '#24101A' };
  ext.fontFamily = Object.assign({}, ext.fontFamily, {
    sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
    display: ['"Bricolage Grotesque"', '"Be Vietnam Pro"', 'sans-serif']
  });
  ext.boxShadow = Object.assign({}, ext.boxShadow, {
    sm: '0 1px 2px rgba(110,60,20,.06)',
    DEFAULT: '0 2px 6px rgba(110,60,20,.07)',
    md: '0 6px 16px -4px rgba(110,60,20,.10)',
    lg: '0 12px 24px -8px rgba(110,60,20,.14)',
    xl: '0 18px 32px -10px rgba(110,60,20,.16)',
    '2xl': '0 26px 50px -14px rgba(90,40,20,.22)'
  });
  tw.config = cfg;
})();
