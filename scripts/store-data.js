(() => {
  "use strict";
  const script = document.currentScript;
  const root = new URL("../", script.src);
  const sheetConfig = window.SHOP_GOOGLE_SHEETS || {};
  const page = location.pathname.split("/").pop().toLowerCase();
  const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
  const esc = (value = "") => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);
  const normalizeSearch = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g,"d").toLocaleLowerCase("vi").trim();
  function wordSimilarity(first, second) {
    if (first === second) return 1;
    if (!first || !second) return 0;
    const previous = Array.from({length:second.length+1},(_,index)=>index);
    for (let firstIndex=1;firstIndex<=first.length;firstIndex+=1) {
      let diagonal=previous[0]; previous[0]=firstIndex;
      for (let secondIndex=1;secondIndex<=second.length;secondIndex+=1) {
        const oldValue=previous[secondIndex];
        previous[secondIndex]=Math.min(previous[secondIndex]+1,previous[secondIndex-1]+1,diagonal+(first[firstIndex-1]===second[secondIndex-1]?0:1));
        diagonal=oldValue;
      }
    }
    return 1-previous[second.length]/Math.max(first.length,second.length);
  }

  function productSearchScore(product, query) {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return 0;
    const name = normalizeSearch(product.name);
    const leafCategory = String(product.categoryIds.at(-1) || "").split("/").pop();
    const category = normalizeSearch(leafCategory);
    if (name.includes(normalizedQuery)) return 100;
    if (category.includes(normalizedQuery)) return 95;
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const targetTokens = `${name} ${category}`.split(/\s+/).filter(Boolean);
    let matchedWeight = 0, totalWeight = 0;
    queryTokens.forEach((token,index) => {
      const weight=index+1;
      totalWeight+=weight;
      const bestMatch=targetTokens.reduce((best,target)=>Math.max(best,wordSimilarity(token,target)),0);
      if (bestMatch>=0.8) matchedWeight+=weight*bestMatch;
    });
    return totalWeight ? matchedWeight/totalWeight*100 : 0;
  }
  let products = [], categories = [], variants = [], galleryProductIds = null, searchKeywords = [];
  const initialParams = new URLSearchParams(location.search);
  const saleVariantIds = new Set(String(initialParams.get("variants") || "").split(/[,/|\s]+/).map(value=>value.trim()).filter(Boolean));
  const shopFilters = { query:initialParams.get("q") || "", category:initialParams.get("category") || "", color:"", size:"", minPrice:null, maxPrice:null };
  const SALE_CATEGORY = "sale";
  const MAIN_CATEGORIES = ["Váy","Quần áo","Phụ kiện","Đồ chơi"];
  const collapsedCategories = new Set();
  const CART_KEY = "shopCart";
  const siteUrl = path => new URL(path, root).href;
  const homePageUrl = () => siteUrl("index.html");
  const isMobileShop = () => window.matchMedia("(max-width: 767px)").matches;
  const shopPageUrl = () => siteUrl(isMobileShop() ? "pages/shop-three-column.html" : "pages/shop-with-sidebar.html");
  const saleShopPageUrl = (ids, hasDiscount = false) => {
    const url = new URL(shopPageUrl());
    if (hasDiscount) url.searchParams.set("category", SALE_CATEGORY);
    else if (ids.length) url.searchParams.set("variants", ids.join(","));
    return url.href;
  };

  function trackSearchKeyword(value) {
    const keyword = String(value || "").trim();
    const endpoint = String(sheetConfig.searchStatsEndpoint || "").trim();
    if (!keyword || !endpoint) return;
    const body = JSON.stringify({ keyword });
    if (navigator.sendBeacon?.(endpoint, body)) return;
    fetch(endpoint, { method:"POST", mode:"no-cors", keepalive:true, headers:{ "Content-Type":"text/plain;charset=UTF-8" }, body }).catch(()=>{});
  }

  function renderNavbar() {
    const header = document.querySelector("#header");
    if (!header) return;
    const activePage = page || "index.html";
    const active = names => names.includes(activePage) ? " active" : "";
    header.innerHTML = `<nav class="navbar navbar-expand-lg" aria-label="Điều hướng chính">
      <div class="container-lg">
        <a class="navbar-brand me-5" href="${homePageUrl()}"><img src="${siteUrl("images/logo.png")}" alt="Cửa hàng"></a>
        <a class="mobile-cart-link d-lg-none" href="${siteUrl("pages/cart.html")}" data-bs-toggle="offcanvas" data-bs-target="#offcanvasCart" aria-controls="offcanvasCart" aria-label="Giỏ hàng">
          <svg class="cart" width="24" height="24"><use xlink:href="#cart"></use></svg><span class="bg-primary text-light rounded-pill position-absolute text-center" data-cart-count>0</span>
        </a>
        <button class="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#offcanvasNavbar2" aria-controls="offcanvasNavbar2" aria-label="Mở menu">
          <svg class="navbar-icon" width="35" height="35"><use xlink:href="#navbar-icon"></use></svg>
        </button>
        <div class="offcanvas offcanvas-end text-bg-dark" tabindex="-1" id="offcanvasNavbar2" aria-labelledby="offcanvasNavbar2Label">
          <div class="offcanvas-header justify-content-center"><button type="button" class="btn-close btn-close-dark" data-bs-dismiss="offcanvas" aria-label="Đóng"></button></div>
          <div class="offcanvas-body align-items-center">
            <ul class="navbar-nav ms-5 flex-grow-1 pe-3">
              <li class="nav-item ms-3"><a class="nav-link text-dark${active(["index.html",""])}" href="${homePageUrl()}">Trang chủ</a></li>
              <li class="nav-item ms-3"><a class="nav-link text-dark${active(["about.html"])}" href="${siteUrl("pages/about.html")}">Giới thiệu</a></li>
              <li class="nav-item ms-3"><a class="nav-link text-dark${active(["shop-with-sidebar.html","shop-three-column.html","single-product.html"])}" href="${shopPageUrl()}">Cửa hàng</a></li>
            </ul>
            <div class="navbar-users">
              <ul class="user-items list-unstyled d-none d-lg-flex justify-content-end align-items-center order-3 flex-grow-1 gap-4 m-0">
                <li><form id="siteSearchForm" class="d-flex align-items-center gap-1"><button class="border-0 bg-transparent p-0" type="submit" aria-label="Tìm kiếm"><svg class="search" width="18" height="18"><use xlink:href="#search"></use></svg></button><input name="q" value="${esc(shopFilters.query)}" type="search" placeholder="Tìm sản phẩm..." class="outline-none border-0 bg-transparent fst-italic"></form></li>
                <li><a href="#" data-bs-toggle="offcanvas" data-bs-target="#offcanvasLogin" aria-controls="offcanvasLogin"><svg class="user" width="18" height="18"><use xlink:href="#user"></use></svg></a></li>
                <li class="position-relative"><a href="${siteUrl("pages/cart.html")}" data-bs-toggle="offcanvas" data-bs-target="#offcanvasCart" aria-controls="offcanvasCart"><svg class="cart" width="18" height="18"><use xlink:href="#cart"></use></svg><span class="bg-primary text-light rounded-pill position-absolute text-center" data-cart-count>0</span></a></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </nav>`;
  }

  function clearSampleProducts() {
    document.querySelectorAll(".product-item").forEach(node=>node.remove());
    document.querySelectorAll(".widget-product-categories ul, .widget-product-tags ul, .widget-color-filter ul, .widget-size-filter ul, .widget-price-filter ul").forEach(list=>list.innerHTML="");
    document.querySelectorAll(".paging-navigation .pagination").forEach(pagination=>pagination.innerHTML="");
    if (page === "single-product.html") {
      const descriptionTab=document.querySelector("#nav-home");
      if(descriptionTab)descriptionTab.innerHTML="";
      document.querySelector("#nav-information-tab")?.remove();
      document.querySelector("#nav-information")?.remove();
      document.querySelector("#nav-review-tab")?.remove();
      document.querySelector("#nav-review")?.remove();
    }
    if (page === "index.html") {
      const promotionWrapper = document.querySelector("#intro .main-swiper .swiper-wrapper");
      if (promotionWrapper) promotionWrapper.innerHTML = "";
      const gallerySection = document.querySelector("#gallery");
      if (gallerySection) {
        gallerySection.classList.add("d-none");
        const galleryGrid = gallerySection.querySelector(".container-lg > .row:last-child");
        if (galleryGrid) galleryGrid.innerHTML = "";
      }
      const tagsSection = document.querySelector("#tags");
      if (tagsSection) {
        tagsSection.classList.add("d-none");
        const tagsList = tagsSection.querySelector(".d-flex.flex-wrap");
        if (tagsList) tagsList.innerHTML = "";
      }
      document.querySelector("#testimonials")?.remove();
    }
    document.querySelectorAll("#featured-product").forEach(section=>section.classList.add("d-none"));
    const detailSection=document.querySelector("#selling-product");
    if (detailSection) detailSection.classList.add("d-none");
    document.querySelectorAll("#offcanvasCart .offcanvas-body").forEach(body=>body.innerHTML="");
    const cartRows=document.querySelector("#cartPageRows");
    if (cartRows) cartRows.innerHTML="";
    document.querySelector("#latest-blog")?.remove();
  }

  function normalizeSocialLinks() {
    document.querySelectorAll('a[href*="tiktok.com"],a[aria-label="TikTok"]').forEach(link=>{
      link.href="https://www.tiktok.com/@annhithoitrangcuabe";
      link.target="_blank";
      link.rel="noopener noreferrer";
    });
    document.querySelectorAll('a[href*="shopee.vn"],a[aria-label="Shopee"]').forEach(link=>{
      link.href="https://shopee.vn/annhithoitrangcuabe";
      link.target="_blank";
      link.rel="noopener noreferrer";
    });
    document.querySelectorAll('a[href*="zalo.me"],a[aria-label="Zalo"]').forEach(link=>{
      link.href="https://zalo.me/0862528119";
      link.target="_blank";
      link.rel="noopener noreferrer";
    });
  }

  function renderFooter() {
    const footerHtml = `<footer id="footer" class="position-relative bg-light py-5 mt-4 mb-0">
      <div class="container"><div class="row d-flex flex-wrap justify-content-between">
        <div class="col-lg-3 col-md-6"><div class="footer-menu"><h5 class="widget-title text-secondary">Liên kết nhanh</h5><ul class="menu-list list-unstyled">
          <li class="menu-item pb-2"><a href="${homePageUrl()}" class="item-anchor">Trang chủ</a></li>
          <li class="menu-item pb-2"><a href="${siteUrl("pages/about.html")}" class="item-anchor">Giới thiệu</a></li>
          <li class="menu-item pb-2"><a href="${shopPageUrl()}" class="item-anchor">Cửa hàng</a></li>
        </ul></div></div>
        <div class="col-lg-3 col-md-6"><div class="footer-menu"><h5 class="widget-title text-secondary">Giúp đỡ</h5><ul class="menu-list list-unstyled">
          <li class="menu-item pb-2"><a href="${siteUrl("pages/faqs.html")}" class="item-anchor">Câu hỏi thường gặp</a></li>
          <li class="menu-item pb-2"><a href="#" class="item-anchor">Điều khoản</a></li>
          <li class="menu-item pb-2"><a href="#" class="item-anchor">Đối tác liên kết</a></li>
        </ul></div></div>
        <div class="col-lg-3 col-md-6"><div class="footer-menu"><h5 class="widget-title text-secondary">Mạng xã hội</h5><ul class="list-unstyled">
          <li class="fw-medium pb-2"><a href="https://www.facebook.com/people/An-Nhi-Th%E1%BB%9Di-Trang-C%E1%BB%A7a-B%C3%A9/61592419492616/" target="_blank" rel="noopener noreferrer">Facebook</a></li>
          <li class="fw-medium pb-2"><a href="https://www.tiktok.com/@annhithoitrangcuabe" target="_blank" rel="noopener noreferrer">TikTok</a></li>
        </ul></div></div>
        <div class="col-lg-3 col-md-6"><div class="footer-menu"><h5 class="widget-title text-secondary">Liên hệ</h5>
          <div class="footer-contact-phone mb-2">Số điện thoại: +84 862 528 119</div><div class="footer-contact-phone mb-2">Email: annhithoitrangcuabe@gmail.com</div>
          <ul class="list-unstyled social-app-icons d-flex flex-wrap gap-2 mb-0">
            <li><a href="https://www.facebook.com/people/An-Nhi-Th%E1%BB%9Di-Trang-C%E1%BB%A7a-B%C3%A9/61592419492616/" target="_blank" rel="noopener noreferrer" class="social-app-icon" aria-label="Facebook"><img src="${siteUrl("images/fb.jpg")}" alt="Facebook"></a></li>
            <li><a href="https://zalo.me/0862528119" target="_blank" rel="noopener noreferrer" class="social-app-icon" aria-label="Zalo"><img src="${siteUrl("images/zalo.webp")}" alt="Zalo"></a></li>
            <li><a href="https://shopee.vn/annhithoitrangcuabe" target="_blank" rel="noopener noreferrer" class="social-app-icon" aria-label="Shopee"><img src="${siteUrl("images/shopee.png")}" alt="Shopee"></a></li>
            <li><a href="https://www.tiktok.com/@annhithoitrangcuabe" target="_blank" rel="noopener noreferrer" class="social-app-icon" aria-label="TikTok"><img src="${siteUrl("images/tiktok.webp")}" alt="TikTok"></a></li>
          </ul>
        </div></div>
      </div></div>
    </footer>`;
    document.querySelectorAll(".footer-bottom").forEach(node=>node.remove());
    const oldFooter=document.querySelector("#footer");
    if (oldFooter) oldFooter.outerHTML=footerHtml;
    else document.body.insertAdjacentHTML("beforeend",footerHtml);
    document.querySelector("#footer").insertAdjacentHTML("afterend",`<div class="footer-bottom py-3 bg-light"><div class="container"><p class="m-0">©2026 AN NHI.</p></div></div>`);
  }

  function renderFloatingSocials() {
    let scrollButton=document.querySelector("#scroll-top-btn");
    if(!scrollButton){
      document.body.insertAdjacentHTML("beforeend",`<button id="scroll-top-btn" class="bg-light rounded-pill text-primary position-fixed" type="button" aria-label="Trở về đầu trang"><span aria-hidden="true">↑</span></button>`);
      scrollButton=document.querySelector("#scroll-top-btn");
    }
    scrollButton.addEventListener("click",()=>window.scrollTo({top:0,behavior:"smooth"}));
    const updateScrollButton=()=>scrollButton.classList.toggle("show",window.scrollY>250);
    window.addEventListener("scroll",updateScrollButton,{passive:true}); updateScrollButton();
    document.querySelector(".floating-social-links")?.remove();
    document.body.insertAdjacentHTML("beforeend",`<aside class="floating-social-links" aria-label="Liên hệ nhanh">
      <a href="https://www.facebook.com/people/An-Nhi-Th%E1%BB%9Di-Trang-C%E1%BB%A7a-B%C3%A9/61592419492616/" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><img src="${siteUrl("images/fb.jpg")}" alt=""></a>
      <a href="https://zalo.me/0862528119" target="_blank" rel="noopener noreferrer" aria-label="Zalo"><img src="${siteUrl("images/zalo.webp")}" alt=""></a>
      <a href="https://shopee.vn/annhithoitrangcuabe" target="_blank" rel="noopener noreferrer" aria-label="Shopee"><img src="${siteUrl("images/shopee.png")}" alt=""></a>
      <a href="https://www.tiktok.com/@annhithoitrangcuabe" target="_blank" rel="noopener noreferrer" aria-label="TikTok"><img src="${siteUrl("images/tiktok.webp")}" alt=""></a>
    </aside>`);
  }

  function wireMainCategoryLinks() {
    document.querySelectorAll("a").forEach(link=>{
      const label=link.textContent.trim().toLocaleLowerCase("vi");
      const category=MAIN_CATEGORIES.find(name=>name.toLocaleLowerCase("vi")===label);
      if(!category)return;
      const url=new URL(shopPageUrl()); url.searchParams.set("category",category); link.href=url.href;
    });
  }
  function removeCheckoutActions() {
    document.querySelectorAll('a[href*="checkout"], button').forEach(element => {
      const label=element.textContent.trim();
      if (element.matches('a[href*="checkout"]') || /thanh\s*toán|checkout/i.test(label)) element.remove();
    });
  }
  const getCart = () => {
    try {
      const saved=JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter(item=>item && item.id && Number(item.quantity)>0).map(item=>({...item,quantity:Number(item.quantity)})) : [];
    } catch { return []; }
  };
  const setCart = cart => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
    catch { alert("Trình duyệt không thể lưu giỏ hàng. Vui lòng bật lưu trữ trang web."); }
    renderCart();
  };
  const cartKey = item => `${item.id}::${item.variantId || ""}`;
  const cartItemStock = item => {
    const product = products.find(entry => entry.id === item.id);
    if (!product) return 0;
    const variant = variants.find(entry => entry.id === item.variantId && entry.productId === item.id);
    return Math.max(0, Number(variant ? variant.stock : product.stock) || 0);
  };
  const normalizeCartStock = () => {
    const currentCart = getCart();
    const normalizedCart = currentCart.map(item => ({
      ...item,
      quantity: Math.min(Math.max(1, Number(item.quantity) || 1), cartItemStock(item))
    })).filter(item => item.quantity > 0);
    if (JSON.stringify(currentCart) !== JSON.stringify(normalizedCart)) {
      try { localStorage.setItem(CART_KEY, JSON.stringify(normalizedCart)); } catch {}
    }
    return normalizedCart;
  };
  const cartDetails = () => getCart().map(item => {
    const baseProduct = products.find(p => p.id === item.id);
    if (!baseProduct) return null;
    const variant = variants.find(v => v.id === item.variantId && v.productId === item.id);
    const product = variant ? { ...baseProduct, price:variant.price || baseProduct.price, stock:variant.stock, image:variant.image || baseProduct.image } : baseProduct;
    return { ...item, key:cartKey(item), product, variant };
  }).filter(Boolean);
  const cartTotal = () => cartDetails().reduce((sum,item) => sum + item.product.price * item.quantity, 0);

  function addToCart(id, quantity = 1, variantId = "") {
    const baseProduct = products.find(p => p.id === id);
    const variant = variants.find(v => v.id === variantId && v.productId === id);
    const product = variant ? { ...baseProduct, stock:variant.stock } : baseProduct;
    if (!product || product.stock <= 0) return alert("Sản phẩm đang tạm hết hàng.");
    const cart = getCart(); const item = cart.find(entry => entry.id === id && (entry.variantId || "") === variantId);
    const requested = (item?.quantity || 0) + Math.max(1, Number(quantity) || 1);
    if (requested > product.stock) {
      alert(`Bạn chỉ có thể mua tối đa ${product.stock} sản phẩm theo số lượng đang còn trong kho.`);
    }
    const next = Math.min(product.stock, requested);
    if (item) item.quantity = next; else cart.push({ id, variantId, quantity:next });
    setCart(cart);
  }

  const detailUrl = id => { const url = new URL("pages/single-product.html", root); url.searchParams.set("id", id); return url.href; };
  const imageUrl = value => { try { return new URL(value || "images/logo.png", root).href; } catch { return value; } };

  function parseCsv(text) {
    const rows = [];
    let row = [], value = "", quoted = false;
    text = String(text || "").replace(/^\uFEFF/, "");
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted && char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { row.push(value); value = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(value); rows.push(row); row = []; value = "";
      } else value += char;
    }
    if (value || row.length) { row.push(value); rows.push(row); }
    while (rows.length && !rows[0].some(cell => cell.trim())) rows.shift();
    const headers = (rows.shift() || []).map(header => header.trim());
    return rows.filter(cells => cells.some(cell => cell.trim())).map(cells =>
      Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))
    );
  }

  function sheetUrl(sheetName, sheetGid, sheetRange) {
    const configuredValue = String(sheetConfig.spreadsheet || sheetConfig.spreadsheetId || "").trim();
    const id = configuredValue.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || configuredValue;
    if (!id || id.startsWith("THAY_BANG_")) throw new Error("Chưa cấu hình Google Sheet trong scripts/google-sheets-config.js");
    const selector = sheetGid !== undefined && sheetGid !== null
      ? `&gid=${encodeURIComponent(sheetGid)}`
      : `&sheet=${encodeURIComponent(sheetName)}`;
    const range = sheetRange ? `&range=${encodeURIComponent(sheetRange)}` : "";
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?tqx=out:csv${selector}${range}`;
  }

  async function fetchSheet(sheetName, sheetGid, sheetRange) {
    const response = await fetch(sheetUrl(sheetName, sheetGid, sheetRange), { cache: "no-store" });
    if (!response.ok) throw new Error(`Không tải được sheet ${sheetName} (${response.status})`);
    return parseCsv(await response.text());
  }

  function parsePrice(value) {
    const normalized = String(value ?? "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    return Number(normalized) || 0;
  }

  function parseDiscount(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return 0;
    const numeric = Number(raw.replace("%", "").replace(",", "."));
    if (!Number.isFinite(numeric)) return 0;
    const percent = raw.includes("%") ? numeric : (numeric > 0 && numeric < 1 ? numeric * 100 : numeric);
    return Math.min(100, Math.max(0, percent));
  }

  function isEnabled(value, defaultValue = false) {
    if (value === undefined || value === null) return defaultValue;
    return ["bat","on","true","1","co","yes"].includes(normalizeSearch(value));
  }

  function priceData(originalPrice, discountValue) {
    const discount = parseDiscount(discountValue);
    const price = discount > 0 ? Math.round(originalPrice * (100 - discount) / 100) : originalPrice;
    return { originalPrice, discount, price };
  }

  function priceHtml(product) {
    if (product.discount > 0 && product.originalPrice > product.price) {
      return `<div class="product-price product-price-sale"><del>${currency.format(product.originalPrice)}</del><strong>${currency.format(product.price)}</strong><span class="discount-badge">-${product.discount}%</span></div>`;
    }
    return `<div class="product-price text-primary"><strong>${currency.format(product.price)}</strong></div>`;
  }

  function renderPromotions(rows = []) {
    if (page !== "index.html") return;
    const wrapper = document.querySelector("#intro .main-swiper .swiper-wrapper");
    if (!wrapper) return;
    const promotions = rows.map(row => ({
      image: normalizeImage(row.Anh ?? row["Ảnh"]),
      discount: parseDiscount(row.Giam ?? row["Giảm"] ?? row["Giảm giá"]),
      title: String(row.TieuDe ?? row["Tiêu đề"] ?? "").trim(),
      content: String(row.NoiDung ?? row["Nội dung"] ?? "").trim(),
      variantIds: String(row.MaSale ?? row["Mã sale"] ?? "").split(/[,/|\s]+/).map(value=>value.trim()).filter(Boolean)
    })).filter(item => item.image);
    const intro = wrapper.closest("#intro");
    if (!promotions.length) {
      wrapper.innerHTML = "";
      intro?.classList.add("d-none");
      return;
    }
    intro?.classList.remove("d-none");
    wrapper.innerHTML = promotions.map(item => `<div class="swiper-slide"><div class="promotion-banner"><div class="promotion-media"><img src="${esc(imageUrl(item.image))}" alt="${esc(item.title || "Banner khuyến mãi")}" loading="eager">${item.discount > 0 ? `<span class="promotion-discount"><img src="${esc(siteUrl("images/sale.png"))}" alt="Sale"><b>-${item.discount}%</b></span>` : ""}</div><div class="promotion-panel"><div class="promotion-copy"><h1 class="promotion-title">${esc(item.title)}</h1>${item.content ? `<p class="promotion-content">${esc(item.content)}</p>` : ""}<a href="${esc(saleShopPageUrl(item.variantIds, item.discount > 0))}" class="btn btn-primary btn-md text-uppercase rounded-0 promotion-button">Xem chi tiết</a></div></div></div></div>`).join("");
    const swiperElement = wrapper.closest(".main-swiper");
    swiperElement?.classList.toggle("single-promotion", promotions.length === 1);
    const swiper = swiperElement?.swiper;
    if (swiper) {
      if (swiper.params.loop) swiper.loopDestroy();
      swiper.update();
      if (swiper.params.loop && promotions.length > 1) swiper.loopCreate();
      if (swiper.params.loop && promotions.length > 1) swiper.slideToLoop(0, 0);
      else swiper.slideTo(0, 0);
      if (promotions.length > 1) swiper.autoplay?.start();
      else swiper.autoplay?.stop();
    }
  }

  function parseSheetDate(value) {
    const raw=String(value ?? "").trim();
    if(!raw)return 0;
    const vietnameseDate=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if(vietnameseDate)return new Date(Number(vietnameseDate[3]),Number(vietnameseDate[2])-1,Number(vietnameseDate[1]),Number(vietnameseDate[4]||0),Number(vietnameseDate[5]||0),Number(vietnameseDate[6]||0)).getTime();
    if(/^\d+(?:\.\d+)?$/.test(raw))return Math.round((Number(raw)-25569)*86400000);
    const timestamp=Date.parse(raw); return Number.isNaN(timestamp)?0:timestamp;
  }

  function normalizeImage(value) {
    const raw = String(value ?? "").trim();
    const imageFormula = raw.match(/^=IMAGE\(\s*["']([^"']+)["']/i);
    const hyperlinkFormula = raw.match(/^=HYPERLINK\(\s*["']([^"']+)["']/i);
    const url = imageFormula?.[1] || hyperlinkFormula?.[1] || raw;
    if (/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\//i.test(url)) return "";
    const driveId = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/)?.[1]
      || url.match(/drive\.google\.com\/[^#?]*[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
    return driveId ? `https://lh3.googleusercontent.com/d/${encodeURIComponent(driveId)}=w1600` : url;
  }

  function readSheets(productRows, categoryRows = [], variantRows = [], promotionRows = [], discountRows = []) {
    products = productRows
      .filter(row => (row.MaSP || row.STT || row["Tên sản phẩm"]) && !["Tạm ẩn", "Ngừng bán"].includes(row.TrangThai))
      .map((row, index) => ({
        id: String(row.MaSP || row["Mã sản phẩm"] || row.STT || index + 1),
        name: String(row.TenSP || row["Tên sản phẩm"] || "Sản phẩm"),
        categoryId: String(row.MaPhanLoai || row["Phân loại"] || "Khác").trim(),
        ...priceData(parsePrice(row.Gia ?? row["Giá"]), row.GiamGia ?? row["Giảm giá"]),
        stock: (row.TonKho ?? row["Số lượng"]) === undefined || (row.TonKho ?? row["Số lượng"]) === "" ? 999 : Number(row.TonKho ?? row["Số lượng"]) || 0,
        sold: Number(row.DaBan ?? row["Đã bán"]) || 0,
        image: normalizeImage(row.Anh || row["Hình ảnh"] || row["Link ảnh"]),
        gallery: String(row["Ảnh phụ"] || "").split("|").map(normalizeImage).filter(Boolean),
        description: String(row.MoTa || row["Mô tả"] || "")
      }));
    products.forEach(product => {
      const categoryParts = product.categoryId.split("/").map(value=>value.trim()).filter(Boolean);
      const first=normalizeSearch(categoryParts[0]);
      if(categoryParts.length && !MAIN_CATEGORIES.some(name=>normalizeSearch(name)===first)) {
        if(/^(bo do|quan|ao|thoi trang)/.test(first))categoryParts.unshift("Quần áo");
      }
      product.categoryIds = categoryParts.map((value,index)=>categoryParts.slice(0,index+1).join("/"));
      product.categoryId = product.categoryIds[0] || "Khác";
      if (!product.categoryIds.length) product.categoryIds=[product.categoryId];
    });
    categories = categoryRows.length
      ? categoryRows.filter(row => row.MaPhanLoai).map(row => ({ id:String(row.MaPhanLoai), name:String(row.TenPhanLoai) }))
      : [...new Set([...MAIN_CATEGORIES,...products.flatMap(product => product.categoryIds)])].map(id => ({ id, name:id.split("/").pop(), level:id.split("/").length-1 }));
    categories.sort((first,second)=>{
      const firstRoot=first.id.split("/")[0],secondRoot=second.id.split("/")[0];
      const firstRank=MAIN_CATEGORIES.indexOf(firstRoot),secondRank=MAIN_CATEGORIES.indexOf(secondRoot);
      if(firstRank!==secondRank)return (firstRank<0?999:firstRank)-(secondRank<0?999:secondRank);
      return first.id.localeCompare(second.id,"vi");
    });
    variants = variantRows.filter(row => row["Mã biến thể"] && row["Mã sản phẩm"]).map(row => {
      const activeValue = row.Active ?? row["Active (Bật / Tắt)"] ?? row["Active (Bật/Tắt)"];
      const discount = isEnabled(activeValue) ? (row.GiamGia ?? row["Giảm giá"]) : 0;
      return {
        id:String(row["Mã biến thể"]), productId:String(row["Mã sản phẩm"]), color:String(row["Màu sắc"] || ""),
        size:String(row["Kích cỡ"] || ""), image:normalizeImage(row.Anh || row["Ảnh"]),
        ...priceData(parsePrice(row.Gia ?? row["Giá"]), discount), stock:Number(row["Số lượng"]) || 0, sold:Number(row["Đã bán"]) || 0,
        publishedAt:parseSheetDate(row["Ngày đăng"]), publishedDate:String(row["Ngày đăng"] || "")
      };
    });
    const promotionDiscounts = new Map();
    promotionRows.forEach(row => {
      const discount = parseDiscount(row.Giam ?? row["Giảm"] ?? row["Giảm giá"]);
      const ids = String(row.MaSale ?? row["Mã sale"] ?? "").split(/[,/|\s]+/).map(value=>value.trim()).filter(Boolean);
      ids.forEach(id => promotionDiscounts.set(id, Math.max(promotionDiscounts.get(id) || 0, discount)));
    });
    const configuredDiscounts = new Map();
    let storewideDiscount = 0;
    discountRows.forEach(row => {
      const discount = parseDiscount(row["Giảm giá %"] ?? row.GiamGia ?? row["Giảm giá"]);
      if (!discount) return;
      const storewide = normalizeSearch(row["Toàn sàn (Bật/ Tắt)"] ?? row["Toàn sàn"] ?? row.ToanSan);
      if (isEnabled(storewide)) storewideDiscount = Math.max(storewideDiscount, discount);
      const ids = String(row["Mã sản phẩm, mã biến thể"] ?? row.Ma ?? row.MaSale ?? "").split(/[,/|\s]+/).map(value=>value.trim()).filter(Boolean);
      ids.forEach(id => configuredDiscounts.set(id, Math.max(configuredDiscounts.get(id) || 0, discount)));
    });
    variants.forEach(variant => {
      const bestDiscount = Math.max(variant.discount || 0, promotionDiscounts.get(variant.id) || 0, configuredDiscounts.get(variant.id) || 0, configuredDiscounts.get(variant.productId) || 0, storewideDiscount);
      variant.discount = bestDiscount;
      variant.price = bestDiscount > 0 ? Math.round(variant.originalPrice * (100 - bestDiscount) / 100) : variant.originalPrice;
    });
    products.forEach(product => {
      const productDiscount = Math.max(product.discount || 0, configuredDiscounts.get(product.id) || 0, storewideDiscount);
      product.discount = productDiscount;
      product.price = productDiscount > 0 ? Math.round(product.originalPrice * (100 - productDiscount) / 100) : product.originalPrice;
      product.variants = variants.filter(variant => variant.productId === product.id);
      if (product.variants.length) {
        product.stock = product.variants.reduce((sum, variant) => sum + variant.stock, 0);
        product.sold = product.variants.reduce((sum, variant) => sum + variant.sold, 0);
        const defaultVariant = product.variants.find(variant => variant.stock > 0) || product.variants[0];
        product.price = defaultVariant.price || product.price;
        product.originalPrice = defaultVariant.originalPrice || product.originalPrice;
        product.discount = defaultVariant.discount || 0;
        product.selectedVariantId = defaultVariant.id;
        product.latestVariant = [...product.variants].sort((first,second)=>second.publishedAt-first.publishedAt)[0];
        product.publishedAt = product.latestVariant?.publishedAt || 0;
      }
    });
  }

  function card(product, className = "col-lg-4 col-md-6 col-sm-6 mb-5") {
    return `<div class="${className}"><div class="product-item" data-product-id="${esc(product.id)}"><a class="image-holder text-center p-3 mb-4 border rounded-4 d-block" href="${detailUrl(product.id)}"><img src="${esc(imageUrl(product.image))}" alt="${esc(product.name)}" class="img-fluid" loading="lazy"></a><div class="product-info ps-2"><h3 class="m-0"><a href="${detailUrl(product.id)}" class="text-secondary">${esc(product.name)}</a></h3>${priceHtml(product)}<small class="text-muted">${product.stock > 0 ? `Còn ${product.stock} sản phẩm` : "Tạm hết hàng"} · Đã bán ${product.sold}</small><br><button type="button" data-add-cart="${esc(product.id)}" data-variant="${esc(product.selectedVariantId || "")}" class="btn btn-outline-gray text-capitalize rounded-pill mt-3 btn-sm" ${product.stock<=0?"disabled":""}>Thêm vào giỏ</button></div></div></div>`;
  }

  function slide(product) {
    return `<div class="swiper-slide"><div class="product-item"><a class="image-holder text-center p-3 mb-4 border rounded-4 d-block" href="${detailUrl(product.id)}"><img src="${esc(imageUrl(product.image))}" alt="${esc(product.name)}" class="img-fluid" loading="lazy"></a><div class="product-info ps-2"><h3 class="m-0"><a href="${detailUrl(product.id)}" class="text-secondary">${esc(product.name)}</a></h3>${priceHtml(product)}<small class="text-muted">Còn ${product.stock} · Đã bán ${product.sold}</small><br><button type="button" data-add-cart="${esc(product.id)}" data-variant="${esc(product.selectedVariantId || "")}" class="btn btn-outline-gray text-capitalize rounded-pill mt-3 btn-sm" ${product.stock<=0?"disabled":""}>Thêm vào giỏ</button></div></div></div>`;
  }

  function renderSidebarFilters() {
    document.querySelector(".widget-product-tags")?.remove();
    const categoryWidget = document.querySelector(".widget-product-categories");
    const categoryList = categoryWidget?.querySelector("ul");
    const saleProducts=products.filter(product=>product.discount>0 || product.variants.some(variant=>variant.discount>0));
    if (categoryWidget) categoryWidget.querySelector(".widget-title").textContent = "Phân loại";
    if (categoryList) categoryList.innerHTML = `<li class="cat-item py-1"><a href="#" data-shop-filter="category" data-value="" class="${shopFilters.category?"":"text-primary fw-bold"}">Tất cả (${products.length})</a></li><li class="cat-item py-1"><a href="#" data-shop-filter="category" data-value="${SALE_CATEGORY}" class="${shopFilters.category===SALE_CATEGORY?"text-primary fw-bold":""}">Sản phẩm giảm giá (${saleProducts.length})</a></li>` + categories.map(category => {
      const level=category.level ?? Math.max(0,category.id.split("/").length-1);
      const hasChildren=categories.some(other=>other.id.startsWith(`${category.id}/`) && (other.level ?? other.id.split("/").length-1)===level+1);
      const hidden=[...collapsedCategories].some(parent=>category.id.startsWith(`${parent}/`));
      const count=products.filter(product=>product.categoryIds.includes(category.id)).length;
      return `<li class="cat-item py-1 ${hidden?"d-none":""}" data-category-level="${level}"><div class="d-flex align-items-center" style="padding-left:${level*16}px">${hasChildren?`<button type="button" class="category-toggle border-0 bg-transparent p-0 me-1 text-secondary" data-category-toggle="${esc(category.id)}" aria-label="${collapsedCategories.has(category.id)?"Mở rộng":"Thu gọn"} ${esc(category.name)}" aria-expanded="${!collapsedCategories.has(category.id)}">${collapsedCategories.has(category.id)?"▸":"▾"}</button>`:(level?`<span class="me-1 text-secondary">↳</span>`:"")}<a href="#" data-shop-filter="category" data-value="${esc(category.id)}" class="${shopFilters.category===category.id?"text-primary fw-bold":""}">${esc(category.name)} (${count})</a></div></li>`;
    }).join("");

    const categoryProducts=products.filter(product=>!shopFilters.category || (shopFilters.category===SALE_CATEGORY ? (product.discount>0 || product.variants.some(variant=>variant.discount>0)) : product.categoryIds.includes(shopFilters.category)));
    const categoryProductIds=new Set(categoryProducts.map(product=>product.id));
    const categoryVariants=variants.filter(variant=>categoryProductIds.has(variant.productId));
    const colors = [...new Set(categoryVariants.map(variant=>variant.color).filter(Boolean))];
    if(shopFilters.color && !colors.includes(shopFilters.color))shopFilters.color="";
    const colorWidget = document.querySelector(".widget-color-filter");
    if (colorWidget) {
      colorWidget.classList.remove("d-none");
      colorWidget.querySelector(".widget-title").textContent = "Lọc theo màu sắc";
      colorWidget.querySelector("ul").innerHTML = `<li class="tags-item py-1"><a href="#" data-shop-filter="color" data-value="" class="${shopFilters.color?"":"text-primary fw-bold"}">Tất cả</a></li>` + colors.map(color=>`<li class="tags-item py-1"><a href="#" data-shop-filter="color" data-value="${esc(color)}" class="${shopFilters.color===color?"text-primary fw-bold":""}">${esc(color)}</a></li>`).join("");
    }

    const sizes = [...new Set(categoryVariants.filter(variant=>!shopFilters.color||variant.color===shopFilters.color).map(variant=>variant.size).filter(Boolean))];
    if(shopFilters.size && !sizes.includes(shopFilters.size))shopFilters.size="";
    const sizeWidget = document.querySelector(".widget-size-filter");
    if (sizeWidget) {
      sizeWidget.classList.remove("d-none");
      sizeWidget.querySelector(".widget-title").textContent = "Lọc theo kích cỡ";
      sizeWidget.querySelector("ul").innerHTML = `<li class="tags-item py-1"><a href="#" data-shop-filter="size" data-value="" class="${shopFilters.size?"":"text-primary fw-bold"}">Tất cả</a></li>` + sizes.map(size=>`<li class="tags-item py-1"><a href="#" data-shop-filter="size" data-value="${esc(size)}" class="${shopFilters.size===size?"text-primary fw-bold":""}">${esc(size)}</a></li>`).join("");
    }

    const priceWidget = document.querySelector(".widget-price-filter");
    if(priceWidget)priceWidget.classList.remove("d-none");
    const priceProducts=categoryProducts.length?categoryProducts:products;
    if (priceWidget && priceProducts.length) {
      const prices=priceProducts.map(product=>product.price).filter(price=>price>=0), min=Math.min(...prices), max=Math.max(...prices);
      const selectedMin=shopFilters.minPrice ?? min, selectedMax=shopFilters.maxPrice ?? max;
      const rangeSpan=Math.max(1,max-min), startPercent=(selectedMin-min)/rangeSpan*100, endPercent=(selectedMax-min)/rangeSpan*100;
      priceWidget.querySelector(".widget-title").textContent = "Lọc theo giá";
      priceWidget.querySelector("ul").innerHTML = `<li class="list-unstyled"><form id="priceFilterForm" class="d-grid gap-2">
        <label class="small">Giá thấp nhất<input class="form-control form-control-sm mt-1" name="minPrice" type="number" min="${min}" max="${max}" step="1000" value="${selectedMin}"></label>
        <label class="small">Giá cao nhất<input class="form-control form-control-sm mt-1" name="maxPrice" type="number" min="${min}" max="${max}" step="1000" value="${selectedMax}"></label>
        <div class="price-range-dual" style="--range-start:${startPercent}%;--range-end:${endPercent}%">
          <input type="range" min="${min}" max="${max}" step="1000" value="${selectedMin}" data-price-range="minPrice" aria-label="Kéo giá thấp nhất">
          <input type="range" min="${min}" max="${max}" step="1000" value="${selectedMax}" data-price-range="maxPrice" aria-label="Kéo giá cao nhất">
        </div>
        <div class="d-flex justify-content-between small fw-bold"><span data-price-min-label>${currency.format(selectedMin)}</span><span data-price-max-label>${currency.format(selectedMax)}</span></div>
        <button class="btn btn-primary btn-sm" type="submit">Áp dụng</button>
        <button class="btn btn-outline-secondary btn-sm" type="button" data-shop-price-reset>Xóa lọc</button>
      </form></li>`;
    }
  }

  function renderShop() {
    const container = document.querySelector(".product-content > .row");
    if (!container) return;
    renderSidebarFilters();
    const sortSelect = document.querySelector("#input-sort");
    if (sortSelect && !sortSelect.dataset.ready) {
      sortSelect.innerHTML = `<option value="default">Sắp xếp mặc định</option><option value="name-asc">Tên (A - Z)</option><option value="name-desc">Tên (Z - A)</option><option value="price-asc">Giá (Thấp - Cao)</option><option value="price-desc">Giá (Cao - Thấp)</option>`;
      sortSelect.dataset.ready = "1"; sortSelect.addEventListener("change", renderShop);
    }
    const searchScores = new Map(products.map(product=>[product.id,productSearchScore(product,shopFilters.query)]));
    const candidates = products.filter(product =>
      (!saleVariantIds.size || product.variants.some(variant=>saleVariantIds.has(variant.id))) &&
      (!shopFilters.category || (shopFilters.category===SALE_CATEGORY ? (product.discount>0 || product.variants.some(variant=>variant.discount>0)) : product.categoryIds.includes(shopFilters.category))) &&
      (!shopFilters.color || product.variants.some(variant=>variant.color===shopFilters.color)) &&
      (!shopFilters.size || product.variants.some(variant=>variant.size===shopFilters.size)) &&
      (shopFilters.minPrice===null || product.price>=shopFilters.minPrice) &&
      (shopFilters.maxPrice===null || product.price<=shopFilters.maxPrice)
    );
    let visible = candidates;
    if (shopFilters.query) {
      const scores = candidates.map(product=>searchScores.get(product.id));
      const band = scores.some(score=>score>=80) ? [80,Infinity]
        : scores.some(score=>score>=51) ? [51,80]
        : scores.some(score=>score>=31) ? [31,51]
        : scores.some(score=>score>=10) ? [10,31]
        : null;
      visible = band ? candidates.filter(product=>searchScores.get(product.id)>=band[0] && searchScores.get(product.id)<band[1]) : [];
    }
    const sort = sortSelect?.value;
    if (shopFilters.query && (!sort || sort === "default")) visible.sort((a,b)=>searchScores.get(b.id)-searchScores.get(a.id));
    if (sort === "name-asc") visible.sort((a,b) => a.name.localeCompare(b.name,"vi"));
    if (sort === "name-desc") visible.sort((a,b) => b.name.localeCompare(a.name,"vi"));
    if (sort === "price-asc") visible.sort((a,b) => a.price-b.price);
    if (sort === "price-desc") visible.sort((a,b) => b.price-a.price);
    const displayedProducts = visible.map(product => {
      if (!shopFilters.color && !shopFilters.size && !saleVariantIds.size && shopFilters.category!==SALE_CATEGORY) return product;
      const selectedVariant = product.variants.find(variant =>
        (!saleVariantIds.size || saleVariantIds.has(variant.id)) &&
        (shopFilters.category!==SALE_CATEGORY || variant.discount>0) &&
        (!shopFilters.color || variant.color === shopFilters.color) &&
        (!shopFilters.size || variant.size === shopFilters.size)
      );
      return selectedVariant ? {
        ...product,
        image:selectedVariant.image || product.image,
        price:selectedVariant.price || product.price,
        originalPrice:selectedVariant.originalPrice || product.originalPrice,
        discount:selectedVariant.discount || 0,
        stock:selectedVariant.stock,
        sold:selectedVariant.sold,
        selectedVariantId:selectedVariant.id
      } : product;
    });
    container.innerHTML = displayedProducts.length ? displayedProducts.map(product => card(product)).join("") : `<div class="col-12 text-center py-5"><h3>Chưa có sản phẩm</h3></div>`;
    const count = document.querySelector(".showing-product p"); if (count) count.textContent = shopFilters.query ? `${visible.length} kết quả cho “${shopFilters.query}”` : `Hiển thị ${visible.length} sản phẩm`;
    document.querySelector(".paging-navigation")?.classList.add("d-none");
  }

  function renderFeatured() {
    const wrapper = document.querySelector("#featured-product .swiper-wrapper") || document.querySelector("#featured-product .display-header + .row");
    if (!wrapper) return;
    const section = wrapper.closest("#featured-product");
    if (!products.length) {
      wrapper.innerHTML = "";
      if (section) {
        section.classList.add("d-none");
        section.hidden = true;
        section.style.setProperty("display", "none", "important");
      }
      return;
    }
    const id = new URLSearchParams(location.search).get("id");
    const currentProduct = products.find(product => product.id === id) || products[0];
    const relatedProducts = page === "single-product.html"
      ? products.filter(product => product.id !== currentProduct.id && product.categoryIds.some(category=>currentProduct.categoryIds.includes(category)))
      : products;
    const isSwiper = wrapper.classList.contains("swiper-wrapper");
    wrapper.innerHTML = relatedProducts.slice(0,10).map(product => isSwiper ? slide(product) : card(product,"col-lg-3 col-md-6 col-sm-6 mb-4")).join("");
    if (section) section.classList.toggle("d-none", relatedProducts.length === 0);
    const swiperElement=wrapper.closest(".swiper");
    const swiper=swiperElement?.swiper;
    if(isMobileShop() && swiperElement){
      if(swiper)swiper.destroy(true,true);
      swiperElement.className="home-product-grid";
      wrapper.className="home-product-grid-list";
      wrapper.removeAttribute("style");
      [...wrapper.children].forEach(slide=>{
        slide.className="home-product-grid-item";
        slide.removeAttribute("style");
      });
    } else if(swiper){
      swiper.update();
      swiper.slideTo(0,0);
    }
  }

  function renderGallery() {
    if (page !== "index.html") return;
    const section = document.querySelector("#gallery");
    const grid = section?.querySelector(".container-lg > .row:last-child");
    if (!section || !grid) return;
    const galleryProducts = galleryProductIds === null ? [] : products
      .filter(product => galleryProductIds.has(product.id))
      .sort((a,b)=>galleryProductIds.get(a.id)-galleryProductIds.get(b.id));
    grid.innerHTML = galleryProducts.map(product => `<div class="col-lg-3 col-md-6"><figure class="gallery-item text-center"><a href="${detailUrl(product.id)}" title="${esc(product.name)}"><img src="${esc(imageUrl(product.image))}" alt="${esc(product.name)}" class="img-fluid rounded-4" loading="lazy"></a></figure></div>`).join("");
    const shouldHide = galleryProducts.length === 0;
    section.classList.toggle("d-none", shouldHide);
    section.hidden = shouldHide;
    if (shouldHide) section.style.setProperty("display", "none", "important");
    else section.style.removeProperty("display");
  }

  function renderSearchTags() {
    if (page !== "index.html") return;
    const section = document.querySelector("#tags");
    const list = section?.querySelector(".d-flex.flex-wrap");
    if (!section || !list) return;
    const keywords = searchKeywords.filter(item=>item.keyword);
    list.innerHTML = keywords.map(item => {
      const name = item.keyword;
      const url = new URL(shopPageUrl());
      url.searchParams.set("q", name);
      return `<div class="tag-item mb-2"><a href="${esc(url.href)}" data-search-keyword="${esc(name)}" class="bg-gray-1 px-3 py-2 hover-filled-slide-down">${esc(name)}</a></div>`;
    }).join("");
    const shouldHide = keywords.length === 0;
    section.classList.toggle("d-none", shouldHide);
    section.hidden = shouldHide;
    if (shouldHide) section.style.setProperty("display", "none", "important");
    else section.style.removeProperty("display");
  }

  function renderNewArrivals() {
    const wrapper=document.querySelector("#new-arrival .swiper-wrapper");
    if(!wrapper)return;
    const newest=[...products].sort((first,second)=>(second.publishedAt||0)-(first.publishedAt||0)).slice(0,8).map(product=>{
      const variant=product.latestVariant;
      return variant ? {...product,image:variant.image||product.image,price:variant.price||product.price,originalPrice:variant.originalPrice||product.originalPrice,discount:variant.discount||0,stock:variant.stock,sold:variant.sold,selectedVariantId:variant.id} : product;
    });
    const swiperElement=wrapper.closest(".swiper");
    const swiper=swiperElement?.swiper;
    if(swiper)swiper.destroy(true,true);
    swiperElement?.classList.add("new-arrival-grid","home-product-grid");
    wrapper.innerHTML=newest.map(slide).join("");
    wrapper.classList.add("home-product-grid-list");
    [...wrapper.children].forEach(slide=>slide.classList.add("home-product-grid-item"));
    const section=wrapper.closest("#new-arrival"); if(section)section.classList.toggle("d-none",!newest.length);
  }

  function renderDetail() {
    const section = document.querySelector("#selling-product");
    if (!section || !products.length) return;
    const id = new URLSearchParams(location.search).get("id");
    const product = products.find(p => p.id === id) || products[0];
    section.classList.remove("d-none");
    const productCategories = product.categoryIds.map(id=>categories.find(category=>category.id===id)?.name || id);
    const title = section.querySelector(".product-title"); if (title) title.textContent = product.name;
    const priceContainer = section.querySelector(".product-price");
    const setDetailPrice = item => {
      if (!priceContainer) return;
      priceContainer.innerHTML = item.discount > 0 && item.originalPrice > item.price
        ? `<del>${currency.format(item.originalPrice)}</del><strong>${currency.format(item.price)}</strong><span class="discount-badge">-${item.discount}%</span>`
        : `<strong>${currency.format(item.price)}</strong>`;
      priceContainer.classList.toggle("product-price-sale", item.discount > 0 && item.originalPrice > item.price);
    };
    setDetailPrice(product);
    const description = section.querySelector(".product-info > p");
    const descriptionText = product.description || "Chưa có mô tả sản phẩm.";
    const descriptionTab = document.querySelector("#nav-home");
    const descriptionTabButton = document.querySelector("#nav-home-tab");
    document.querySelector("#nav-information-tab")?.remove();
    document.querySelector("#nav-information")?.remove();
    document.querySelector("#nav-review-tab")?.remove();
    document.querySelector("#nav-review")?.remove();
    if (descriptionTabButton) descriptionTabButton.textContent = "Mô tả";
    if (descriptionTab) {
      descriptionTab.innerHTML = "";
      const paragraph = document.createElement("p");
      paragraph.style.whiteSpace = "pre-line";
      paragraph.textContent = descriptionText;
      descriptionTab.appendChild(paragraph);
    }
    if (description) description.hidden = true;
    section.querySelector(".color-options")?.remove();
    section.querySelector(".swatch.product-select")?.remove();
    const templateStock = section.querySelector(".product-quantity > .fs-5");
    if (templateStock) {
      if (product.variants.length) templateStock.remove();
      else templateStock.textContent = product.stock > 0 ? `Còn ${product.stock} sản phẩm · Đã bán ${product.sold}` : "Tạm hết hàng";
    }
    const image = section.querySelector(".product-preview img"); if (image) { image.src=imageUrl(product.image); image.alt=product.name; }
    if (image) image.onerror=()=>{ image.onerror=null; image.src=new URL("images/logo.png",root).href; };
    const galleryImages = [...new Set([product.image, ...product.gallery, ...product.variants.map(variant => variant.image)].filter(Boolean))];
    let selectGalleryImage = source => { if (image && source) image.src=imageUrl(source); };
    let holdSelectedImage = () => {};
    if (image && galleryImages.length > 0) {
      const preview = image.closest(".product-preview");
      preview.insertAdjacentHTML("beforeend", `<div class="product-thumbnails d-flex flex-wrap gap-2 mt-3">${galleryImages.map((source,index)=>`<button type="button" class="p-0 bg-white rounded-1" style="width:56px;height:56px;border:2px solid ${index===0?"#f28c28":"#ddd"}" data-gallery-index="${index}" data-gallery-image="${esc(imageUrl(source))}" aria-label="Xem ảnh ${index+1}"><img src="${esc(imageUrl(source))}" alt="" width="52" height="52" style="object-fit:cover;border-radius:3px"></button>`).join("")}</div>`);
      const thumbnails = section.querySelector(".product-thumbnails");
      let galleryIndex = 0, galleryTimer, galleryResumeTimer, pausedByHover=false, resumeAt=0;
      const showGalleryImage = index => {
        const buttons = [...thumbnails.querySelectorAll("[data-gallery-image]")];
        if (!buttons.length) return;
        galleryIndex = (index + buttons.length) % buttons.length;
        image.src = buttons[galleryIndex].dataset.galleryImage;
        buttons.forEach((button, buttonIndex) => button.style.borderColor=buttonIndex===galleryIndex?"#f28c28":"#ddd");
      };
      const startGallery = () => {
        clearInterval(galleryTimer); clearTimeout(galleryResumeTimer);
        if (pausedByHover || galleryImages.length <= 1) return;
        const remaining=resumeAt-Date.now();
        if (remaining>0) { galleryResumeTimer=setTimeout(startGallery,remaining); return; }
        galleryTimer=setInterval(()=>showGalleryImage(galleryIndex+1),3500);
      };
      holdSelectedImage = (milliseconds=10000) => { resumeAt=Date.now()+milliseconds; clearInterval(galleryTimer); clearTimeout(galleryResumeTimer); galleryResumeTimer=setTimeout(startGallery,milliseconds); };
      selectGalleryImage = source => {
        const normalized=imageUrl(source);
        const buttons=[...thumbnails.querySelectorAll("[data-gallery-image]")];
        const index=buttons.findIndex(button=>button.dataset.galleryImage===normalized);
        if(index>=0)showGalleryImage(index); else image.src=normalized;
      };
      thumbnails.addEventListener("click", event => {
        const thumbnail=event.target.closest("[data-gallery-image]"); if(!thumbnail)return;
        showGalleryImage(Number(thumbnail.dataset.galleryIndex)); holdSelectedImage(10000);
      });
      preview.addEventListener("mouseenter",()=>{pausedByHover=true;clearInterval(galleryTimer);clearTimeout(galleryResumeTimer);});
      preview.addEventListener("mouseleave",()=>{pausedByHover=false;startGallery();});
      startGallery();
    }
    if (product.variants.length && description) {
      const colors = [...new Set(product.variants.map(v => v.color).filter(Boolean))];
      const sizes = [...new Set(product.variants.map(v => v.size).filter(Boolean))];
      description.insertAdjacentHTML("afterend", `<div id="variantPicker" class="mb-3"><div class="row g-2"><div class="col-sm-6"><label class="form-label fw-bold">Màu sắc</label><select class="form-select" id="variantColor">${colors.map(value=>`<option>${esc(value)}</option>`).join("")}</select></div><div class="col-sm-6"><label class="form-label fw-bold">Kích cỡ</label><select class="form-select" id="variantSize">${sizes.map(value=>`<option>${esc(value)}</option>`).join("")}</select></div></div><small id="variantStatus" class="d-block mt-2 text-muted"></small></div>`);
      const updateVariant = event => {
        const colorSelect=document.querySelector("#variantColor"), sizeSelect=document.querySelector("#variantSize");
        const color=colorSelect?.value || "";
        const availableSizes=[...new Set(product.variants.filter(variant=>!color||variant.color===color).map(variant=>variant.size).filter(Boolean))];
        if (sizeSelect && (event?.target===colorSelect || !availableSizes.includes(sizeSelect.value))) {
          const previousSize=sizeSelect.value;
          sizeSelect.innerHTML=availableSizes.map(value=>`<option>${esc(value)}</option>`).join("");
          sizeSelect.value=availableSizes.includes(previousSize)?previousSize:(availableSizes[0]||"");
        }
        const size=sizeSelect?.value || "";
        const selected=product.variants.find(v=>(!color||v.color===color)&&(!size||v.size===size));
        const button=section.querySelector("button[name='add-to-cart']");
        if (button) { button.dataset.variant=selected?.id || ""; button.disabled=!selected || selected.stock<=0; }
        const quantityInput=section.querySelector("#quantity");
        if (quantityInput) {
          quantityInput.max=Math.max(0,selected?.stock || 0);
          quantityInput.value=Math.min(Math.max(1,Number(quantityInput.value)||1),Math.max(1,selected?.stock||1));
          quantityInput.disabled=!selected || selected.stock<=0;
        }
        if (selected) setDetailPrice(selected);
        if (selected && image) selectGalleryImage(selected.image || product.image);
        const status=document.querySelector("#variantStatus"); if(status) status.textContent=selected ? `Còn ${selected.stock} · Đã bán ${selected.sold}` : "Biến thể này chưa có hàng";
        if (event) holdSelectedImage(10000);
      };
      document.querySelector("#variantPicker").addEventListener("change", updateVariant); updateVariant();
    }
    const meta = section.querySelectorAll(".meta-product .meta-item");
    const sku = meta[0]?.querySelector("li"); if (sku) sku.textContent=product.id;
    const categoryNode = meta[1]?.querySelector("ul"); if (categoryNode) categoryNode.innerHTML=`<li class="select-item">${esc(productCategories.join(" / ") || "Chưa phân loại")}</li>`;
    meta[2]?.remove();
    const productMeta=section.querySelector(".meta-product");
    if(productMeta && !productMeta.querySelector("#purchaseContact"))productMeta.insertAdjacentHTML("beforeend",`<div id="purchaseContact" class="meta-item d-flex align-items-baseline"><h4 class="fs-4 text-dark pe-2">Liên hệ để đặt mua</h4></div>`);
    if (product.stock <= 0) { const stock=section.querySelector(".stock-button-wrap"); if(stock)stock.innerHTML=`<strong class="text-danger">Sản phẩm đang tạm hết hàng</strong>`; }
    const quantityInput=section.querySelector("#quantity");
    if (quantityInput && !product.variants.length) {
      quantityInput.max=Math.max(0,product.stock);
      quantityInput.value=Math.min(Math.max(1,Number(quantityInput.value)||1),Math.max(1,product.stock));
      quantityInput.disabled=product.stock<=0;
    }
    const addButton = section.querySelector("button[name='add-to-cart']");
    if (addButton && product.stock > 0) { addButton.type="button"; addButton.dataset.addCart=product.id; addButton.textContent="Thêm vào giỏ hàng"; }
    document.title = `${product.name} - Cửa hàng`;
  }

  function cartQuantityControl(item, compact = false) {
    const key=esc(item.key), quantity=Math.max(1,Number(item.quantity)||1), stock=Math.max(1,cartItemStock(item));
    return `<div class="cart-quantity-control${compact ? " cart-quantity-compact" : ""}" role="group" aria-label="Số lượng sản phẩm">
      <button type="button" data-cart-step="-1" data-cart-key="${key}" aria-label="Giảm số lượng" ${quantity<=1?"disabled":""}>−</button>
      <input type="number" min="1" max="${stock}" value="${quantity}" data-cart-quantity="${key}" aria-label="Số lượng">
      <button type="button" data-cart-step="1" data-cart-key="${key}" aria-label="Tăng số lượng" ${quantity>=stock?"disabled":""}>+</button>
    </div>`;
  }

  function renderCart() {
    const items = cartDetails(); const total = cartTotal();
    const itemCount=items.reduce((sum,item)=>sum+item.quantity,0);
    document.querySelectorAll("[data-cart-count]").forEach(node=>node.textContent=itemCount);
    document.querySelectorAll("#offcanvasCart").forEach(canvas => {
      const body = canvas.querySelector(".offcanvas-body"); if (!body) return;
      body.innerHTML = `<h4 class="mb-3 border-bottom pb-3"><span class="text-secondary">Giỏ hàng của bạn</span></h4>
        <ul class="list-group mb-3">${items.length ? items.map(item => `<li class="list-group-item d-flex justify-content-between align-items-center gap-2"><img src="${esc(imageUrl(item.product.image))}" alt="" width="48" height="48" style="object-fit:cover"><div class="flex-grow-1 min-w-0"><a href="${detailUrl(item.id)}" class="text-dark fw-bold">${esc(item.product.name)}</a>${item.variant?`<small class="d-block text-muted">${esc(item.variant.color)} · ${esc(item.variant.size)}</small>`:""}<small class="d-block text-muted">${currency.format(item.product.price)}</small>${cartQuantityControl(item,true)}</div><button class="btn btn-sm text-danger" type="button" data-remove-cart="${esc(item.key)}" aria-label="Xóa sản phẩm">×</button></li>`).join("") : `<li class="list-group-item text-center py-4">Giỏ hàng đang trống</li>`}</ul>
        <div class="d-flex justify-content-between fw-bold mb-3"><span>Tổng cộng</span><span>${currency.format(total)}</span></div><div class="cart-view-action d-grid gap-2"><a class="btn btn-primary" href="${new URL("pages/cart.html",root).href}">Xem giỏ hàng</a></div>`;
    });
    const pageRows = document.querySelector("#cartPageRows");
    if (pageRows) pageRows.innerHTML = items.length ? items.map(item => `<tr><td><img src="${esc(imageUrl(item.product.image))}" alt="${esc(item.product.name)}" width="70" height="70" style="object-fit:cover;border-radius:10px"></td><td><a href="${detailUrl(item.id)}" class="fw-bold text-dark">${esc(item.product.name)}</a><small class="d-block text-muted">${esc(item.id)}${item.variant ? ` · ${esc(item.variant.color)} · ${esc(item.variant.size)}` : ""}</small></td><td>${currency.format(item.product.price)}</td><td>${cartQuantityControl(item)}</td><td>${currency.format(item.product.price*item.quantity)}</td><td><button class="btn text-danger" type="button" data-remove-cart="${esc(item.key)}">Xóa</button></td></tr>`).join("") : `<tr><td colspan="6" class="text-center py-5">Giỏ hàng đang trống. <a href="${new URL("pages/shop-with-sidebar.html",root).href}">Tiếp tục mua sắm</a></td></tr>`;
    document.querySelectorAll("[data-cart-total]").forEach(node => node.textContent=currency.format(total));
    const checkoutTable = document.querySelector(".your-order .total-price table tbody");
    if (checkoutTable) {
      checkoutTable.querySelectorAll(".shop-cart-line").forEach(node=>node.remove());
      checkoutTable.insertAdjacentHTML("afterbegin", items.map(item=>`<tr class="shop-cart-line border-bottom"><td>${esc(item.product.name)} × ${item.quantity}</td><td>${currency.format(item.product.price*item.quantity)}</td></tr>`).join(""));
      checkoutTable.querySelectorAll(".subtotal .amount,.order-total .amount").forEach(node=>node.textContent=currency.format(total));
    }
  }

  document.addEventListener("click", event => {
    const searchKeyword = event.target.closest("[data-search-keyword]");
    if (searchKeyword) trackSearchKeyword(searchKeyword.dataset.searchKeyword);
    const categoryToggle=event.target.closest("[data-category-toggle]");
    if(categoryToggle){
      const categoryId=categoryToggle.dataset.categoryToggle;
      collapsedCategories.has(categoryId)?collapsedCategories.delete(categoryId):collapsedCategories.add(categoryId);
      renderShop();
      return;
    }
    const resetPrice = event.target.closest("[data-shop-price-reset]");
    if (resetPrice) {
      shopFilters.minPrice=null; shopFilters.maxPrice=null; renderShop(); return;
    }
    const filter = event.target.closest("[data-shop-filter]");
    if (filter) {
      event.preventDefault();
      const type=filter.dataset.shopFilter;
      if (type === "price") {
        shopFilters.minPrice=filter.dataset.min === "" ? null : Number(filter.dataset.min);
        shopFilters.maxPrice=filter.dataset.max === "" ? null : Number(filter.dataset.max);
      } else shopFilters[type]=filter.dataset.value || "";
      if (type === "category") {
        const url=new URL(location.href);
        saleVariantIds.clear();
        url.searchParams.delete("variants");
        shopFilters.category ? url.searchParams.set("category",shopFilters.category) : url.searchParams.delete("category");
        history.replaceState(null,"",url);
      }
      renderShop();
      return;
    }
    const add = event.target.closest("[data-add-cart]"); if (add) { event.preventDefault(); addToCart(add.dataset.addCart, document.querySelector("#quantity")?.value || 1, add.dataset.variant || ""); add.textContent="Đã thêm ✓"; setTimeout(()=>add.textContent="Thêm vào giỏ",1200); }
    const stepButton=event.target.closest("[data-cart-step]");
    if(stepButton){
      const cart=getCart(),item=cart.find(entry=>cartKey(entry)===stepButton.dataset.cartKey);
      if(!item)return;
      const stock=cartItemStock(item),next=Math.min(stock,Math.max(1,item.quantity+Number(stepButton.dataset.cartStep)));
      if(next===item.quantity)return;
      item.quantity=next;
      setCart(cart);
      return;
    }
    const remove = event.target.closest("[data-remove-cart]"); if (remove) setCart(getCart().filter(item=>cartKey(item)!==remove.dataset.removeCart));
  });
  document.addEventListener("submit", event => {
    if (event.target.id === "siteSearchForm") {
      event.preventDefault();
      const query=String(new FormData(event.target).get("q") || "").trim();
      if (query) trackSearchKeyword(query);
      const url=new URL(shopPageUrl());
      if(query)url.searchParams.set("q",query);
      location.href=url.href;
      return;
    }
    if (event.target.id !== "priceFilterForm") return;
    event.preventDefault();
    const formData=new FormData(event.target), minValue=formData.get("minPrice"), maxValue=formData.get("maxPrice");
    shopFilters.minPrice=minValue === "" ? null : Math.max(0,Number(minValue)||0);
    shopFilters.maxPrice=maxValue === "" ? null : Math.max(0,Number(maxValue)||0);
    if (shopFilters.minPrice!==null && shopFilters.maxPrice!==null && shopFilters.minPrice>shopFilters.maxPrice) {
      [shopFilters.minPrice,shopFilters.maxPrice]=[shopFilters.maxPrice,shopFilters.minPrice];
    }
    renderShop();
  });
  document.addEventListener("change", event => {
    const input=event.target.closest("[data-cart-quantity]");
    if(!input)return;
    const cart=getCart(),item=cart.find(entry=>cartKey(entry)===input.dataset.cartQuantity);
    if(!item)return;
    const stock=cartItemStock(item),requested=Math.max(1,Number(input.value)||1);
    if(requested>stock)alert(`Số lượng tồn kho hiện tại chỉ còn ${stock} sản phẩm.`);
    item.quantity=Math.min(requested,stock);
    input.value=item.quantity;
    setCart(cart.filter(entry=>entry.quantity>0));
  });
  document.addEventListener("input", event => {
    const cartQuantityInput=event.target.closest("[data-cart-quantity]");
    if(cartQuantityInput) {
      if(cartQuantityInput.value === "")return;
      const maximum=Math.max(0,Number(cartQuantityInput.max)||0);
      cartQuantityInput.value=Math.min(Math.max(1,Number(cartQuantityInput.value)||1),maximum);
      return;
    }
    const productQuantityInput=event.target.closest("#quantity");
    if(productQuantityInput) {
      if(productQuantityInput.value === "")return;
      const maximum=Math.max(0,Number(productQuantityInput.max)||0);
      productQuantityInput.value=Math.min(Math.max(1,Number(productQuantityInput.value)||1),maximum);
      return;
    }
    let range=event.target.closest("[data-price-range]");
    const numberInput=event.target.closest('#priceFilterForm input[type="number"]');
    if (!range && numberInput) {
      range=numberInput.form?.querySelector(`[data-price-range="${numberInput.name}"]`);
      if(range)range.value=numberInput.value;
    }
    if (!range) return;
    const form=range.closest("#priceFilterForm"), field=form?.elements[range.dataset.priceRange];
    if (field) field.value=range.value;
    const minRange=form?.querySelector('[data-price-range="minPrice"]'), maxRange=form?.querySelector('[data-price-range="maxPrice"]');
    if (minRange && maxRange && Number(minRange.value)>Number(maxRange.value)) {
      if (range===minRange) maxRange.value=minRange.value; else minRange.value=maxRange.value;
      form.elements.minPrice.value=minRange.value; form.elements.maxPrice.value=maxRange.value;
    }
    const label=form?.querySelector("[data-price-range-label]");
    if(label)label.textContent=`${currency.format(Number(minRange.value))} – ${currency.format(Number(maxRange.value))}`;
    const track=form?.querySelector(".price-range-dual"), min=Number(minRange.min), max=Number(minRange.max), span=Math.max(1,max-min);
    if(track){track.style.setProperty("--range-start",`${(Number(minRange.value)-min)/span*100}%`);track.style.setProperty("--range-end",`${(Number(maxRange.value)-min)/span*100}%`);}
    const minLabel=form?.querySelector("[data-price-min-label]"),maxLabel=form?.querySelector("[data-price-max-label]");
    if(minLabel)minLabel.textContent=currency.format(Number(minRange.value));
    if(maxLabel)maxLabel.textContent=currency.format(Number(maxRange.value));
  });
  window.addEventListener("storage", event => { if(event.key===CART_KEY)renderCart(); });

  async function init() {
    const canonicalHome=new URL(homePageUrl());
    if ((page === "index.html" || !page) && location.pathname !== canonicalHome.pathname) {
      canonicalHome.search=location.search;
      canonicalHome.hash=location.hash;
      location.replace(canonicalHome.href);
      return;
    }
    if (page === "shop-with-sidebar.html" && isMobileShop()) {
      const mobileUrl=new URL("pages/shop-three-column.html",root);
      mobileUrl.search=location.search;
      location.replace(mobileUrl.href);
      return;
    }
    if (page === "shop-three-column.html" && isMobileShop()) {
      document.querySelector(".hero-section")?.remove();
      const collection=document.querySelector(".product-collection");
      if (collection) { collection.classList.remove("my-lg-10"); collection.classList.add("my-4"); }
    }
    clearSampleProducts();
    removeCheckoutActions();
    renderFooter();
    renderFloatingSocials();
    normalizeSocialLinks();
    renderNavbar();
    wireMainCategoryLinks();
    const promotionRows = await fetchSheet(sheetConfig.promotionSheet || "QuangCao", sheetConfig.promotionGid, sheetConfig.promotionRange || "A:E").catch(error => {
      console.warn("Không thể tải dữ liệu quảng cáo:", error.message);
      return [];
    });
    if (page === "index.html") renderPromotions(promotionRows);
    if (page === "index.html") {
      const featuredRows = await fetchSheet(sheetConfig.gallerySheet || "Trưng bày", sheetConfig.galleryGid).catch(error => {
        console.warn("Không thể tải danh sách trưng bày:", error.message);
        return [];
      });
      const featuredIds = featuredRows.flatMap(row => String(row.MaSP ?? row["Mã sản phẩm"] ?? "").split(/[,/|\s]+/).map(value=>value.trim()).filter(Boolean));
      galleryProductIds = new Map(featuredIds.map((id,index)=>[id,index]));
      const keywordRows = await fetchSheet(sheetConfig.keywordSheet || "TuKhoa", sheetConfig.keywordGid).catch(error => {
        console.warn("Không thể tải từ khóa tìm kiếm:", error.message);
        return [];
      });
      searchKeywords = keywordRows.map(row => ({
        keyword:String(row.TuKhoa ?? row["Từ khóa"] ?? row["Từ khoá"] ?? row.tenmau ?? "").trim(),
        count:Number(row.LuotTim ?? row["Lượt tìm"] ?? row["Lượt Tìm"] ?? row.soluottim) || 0
      })).filter(item=>item.keyword).sort((a,b)=>b.count-a.count || a.keyword.localeCompare(b.keyword,"vi"));
    }
    try {
      const productRows = await fetchSheet(sheetConfig.productSheet || "Sản phẩm", sheetConfig.sheetGid);
      const categoryRows = sheetConfig.categorySheet ? await fetchSheet(sheetConfig.categorySheet) : [];
      const variantRows = sheetConfig.variantGid || sheetConfig.variantSheet ? await fetchSheet(sheetConfig.variantSheet || "BienThe", sheetConfig.variantGid) : [];
      const discountRows = sheetConfig.discountGid || sheetConfig.discountSheet ? await fetchSheet(sheetConfig.discountSheet || "GiamGia", sheetConfig.discountGid).catch(error => {
        console.warn("Không thể tải dữ liệu giảm giá:", error.message);
        return [];
      }) : [];
      readSheets(productRows, categoryRows, variantRows, promotionRows, discountRows);
      normalizeCartStock();
      if (["shop-three-column.html","shop-with-sidebar.html"].includes(page)) renderShop();
      renderDetail(); renderFeatured(); renderNewArrivals(); renderGallery(); renderSearchTags(); renderCart();
      window.dispatchEvent(new CustomEvent("shopdata:ready", { detail:{ products, categories } }));
    } catch(error) { console.warn("Không thể tự tải dữ liệu sản phẩm:", error.message); }
    finally { document.documentElement.classList.add("shop-data-ready"); }
  }
  init();
})();
