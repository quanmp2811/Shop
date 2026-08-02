(function($) {

	"use strict";

	// init jarallax parallax
	var initJarallax = function () {
		jarallax(document.querySelectorAll(".jarallax"));
	
		jarallax(document.querySelectorAll(".jarallax-keep-img"), {
		  keepImg: true,
		});
	  }

	var initChocolat = function() {
		Chocolat(document.querySelectorAll('.image-link'), {
			imageSize: 'contain',
			loop: true,
		});
	}

	var initSlider = function() {

		var swiper = new Swiper(".main-swiper", {
			spaceBetween: 30,
			effect: "fade",
			autoHeight: true,
			loop: true,
			autoplay: {
				delay: 4000,
				disableOnInteraction: false,
				pauseOnMouseEnter: true,
			},
			navigation: {
				nextEl: ".swiper-arrow-next",
				prevEl: ".swiper-arrow-prev",
			},
		});

		var swiper = new Swiper(".product-swiper", {
			slidesPerView: 5,
			spaceBetween: 30,
			navigation: {
				nextEl: '.chevron-arrow-right',
				prevEl: '.chevron-arrow-left',
			},
			breakpoints: {
				0: {
					slidesPerView: 1,
					spaceBetween: 20,
				},
				580: {
					slidesPerView: 2,
					spaceBetween: 20,
				},
				800: {
					slidesPerView: 3,
					spaceBetween: 20,
				},
				1299: {
					slidesPerView: 4,
					spaceBetween: 20,
				},
			},
		});

		var swiper = new Swiper(".review-swiper", {
			spaceBetween: 30,
			pagination: {
				el: ".swiper-pagination",
				clickable: true,
			},
		});
	};

	// input spinner
	var initQuantitySpinner = function(){

		$('.product-qty').each(function(){
	
		  var $el_product = $(this);
		  var quantity = 0;
	
		  $el_product.find('.quantity-right-plus').click(function(e){
			  e.preventDefault();
			  var $input = $el_product.find('#quantity');
			  var quantity = parseInt($input.val(), 10) || 1;
			  var max = parseInt($input.attr('max'), 10);
			  $input.val(Number.isFinite(max) ? Math.min(quantity + 1, max) : quantity + 1).trigger('input');
		  });
	
		  $el_product.find('.quantity-left-minus').click(function(e){
			  e.preventDefault();
			  var $input = $el_product.find('#quantity');
			  var quantity = parseInt($input.val(), 10) || 1;
			  var min = parseInt($input.attr('min'), 10) || 1;
			  $input.val(Math.max(quantity - 1, min)).trigger('input');
		  });
	
		});
	
	  }
	

    // window load
	  $(window).load(function() {
		$(".preloader").fadeOut("slow");
	  })


	// ------------------------------------------------------------------------------ //
	// Scroll Top 
	// ------------------------------------------------------------------------------ //
	
	var btn = $('#scroll-top-btn');

	$(window).scroll(function() {
	  if ($(window).scrollTop() > 300) {
		btn.addClass('show');
	  } else {
		btn.removeClass('show');
	  }
	});
	
	btn.on('click', function(e) {
	  e.preventDefault();
	  $('html, body').animate({scrollTop:0}, '300');
	});


	var initShopPageRedirect = function() {
		var isMobile = window.innerWidth < 992;
		var targetPage = isMobile ? 'shop-three-column.html' : 'shop-with-sidebar.html';

		// Update all shop links on the page to the target page version.
		document.querySelectorAll('a[href*="shop-with-sidebar.html"], a[href*="shop-three-column.html"]').forEach(function(el) {
			el.href = el.href.replace(/shop-with-sidebar\.html|shop-three-column\.html/, targetPage);
		});

		// If the user landed on the wrong shop version, redirect them to the correct one.
		var currentPage = window.location.pathname;
		if (currentPage.indexOf('shop-with-sidebar.html') !== -1 && isMobile) {
			window.location.replace(targetPage);
		} else if (currentPage.indexOf('shop-three-column.html') !== -1 && !isMobile) {
			window.location.replace(targetPage);
		}
	};

	// document ready
	$(document).ready(function() {
		initSlider();
		initChocolat();
		initQuantitySpinner();
		initJarallax();
		initShopPageRedirect();
	}); // document ready

})(jQuery);
