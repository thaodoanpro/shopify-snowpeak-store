if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();

        this.form = this.querySelector('form');
        this.form.querySelector('[name=id]').disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        this.productHandle = "";
        document.addEventListener('click', (event) => {
          if (event.target.matches("#ModalContinueButton")) {
            this.handleSubmitToCart();
          }
          else if (event.target.matches('button[id^="ProductSubmitButton"]')) {
            this.productHandle = event.target.dataset.handle;
          }
        })
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.submitButton = this.querySelector('[type="submit"]');
        this.submitRequestBody = { items: [] };
        if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      async onSubmitHandler(evt) {
        evt.preventDefault();
        if (this.submitButton.getAttribute('aria-disabled') === 'true') return;
        this.handleErrorMessage();
        this.submitButton.setAttribute('aria-disabled', true);
        this.submitButton.classList.add('loading');
        this.querySelector('.loading__spinner').classList.remove('hidden');

        const formData = new FormData(this.form);
        this.productVariantId = formData.get('id');
        const productVariantQuantity = document.querySelector('input[name="quantity"]').value;

        // Add main product to the request's body
        this.submitRequestBody.items.push({
          id: this.productVariantId,
          quantity: productVariantQuantity
        });
        //Display add-on modal
        let response = await fetch(
          `/products/${this.productHandle}?section_id=template--15793187913815__frequently-together`
        );
        let productMarkup = await response.text();
        if (productMarkup.includes('class="frequently-bought-together-item"')) {
          this.openModal(productMarkup, true);       
        }
        else {
          this.handleSubmitToCart();
        }
      }

      handleSubmitToCart() {
        // Include the add-on products
        const frequentlyBoughtTogether = [...document.querySelectorAll('.frequently-bought-together-item')];
        frequentlyBoughtTogether.forEach(item => {
          console.log("item: ", item.innerHTML);
          const quantity = item.querySelector('input[id^="addOnQuantity"]').value;
          this.submitRequestBody.items.push({
            id: item.querySelector('input[id^="addOnId"]').value,
            quantity: item.querySelector('input[id^="addOnQuantity"]').value
          })
        })

        if (this.cart) {
          this.submitRequestBody['sections'] = this.cart.getSectionsToRender().map((section) => section.id);
          this.submitRequestBody['sections_url'] = window.location.pathname;
          this.cart.setActiveElement(document.activeElement);
        }
        const request = {
          method: 'POST',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(this.submitRequestBody)
        }
        fetch(window.Shopify.routes.root + 'cart/add.js', request)
          .then((response) => response.json())
          .then((response) => {
            this.closeModal();
            if (response.status) {
              publish(PUB_SUB_EVENTS.cartError, {
                source: 'product-form',
                productVariantId: this.productVariantId,
                errors: response.errors || response.description,
                message: response.message,
              });
              this.handleErrorMessage(response.description);

              const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
              if (!soldOutMessage) return;
              this.submitButton.setAttribute('aria-disabled', true);
              this.submitButton.querySelector('span').classList.add('hidden');
              soldOutMessage.classList.remove('hidden');
              this.error = true;
              return;
            } else if (!this.cart) {
              window.location = window.routes.cart_url;
              return;
            }

            if (!this.error)
              publish(PUB_SUB_EVENTS.cartUpdate, {
                source: 'product-form',
                productVariantId: this.productVariantId,
                cartData: response,
              });
            this.error = false;
            const quickAddModal = this.closest('quick-add-modal');
            if (quickAddModal) {
              document.body.addEventListener(
                'modalClosed',
                () => {
                  setTimeout(() => {
                    this.cart.renderContents(response);
                  });
                },
                { once: true }
              );
              quickAddModal.hide(true);
            } else {
              this.cart.renderContents(response);
            }
          })
          .catch((e) => {
            console.error(e);
          })
          .finally(() => {
            this.submitButton.classList.remove('loading');
            if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
            if (!this.error) this.submitButton.removeAttribute('aria-disabled');
            this.querySelector('.loading__spinner').classList.add('hidden');
          });
      }

      async openModal(html, shouldShow) {
        if (shouldShow) {
          const replacingHTML = await document.querySelector("#modal-section");
          replacingHTML.outerHTML = html;
        }
        document.querySelector("#modal-section").style.display = 'block';

        //   modal.style.display = "block";
        document.getElementById("custom-modal").style.position = "fixed";
      }

      closeModal() {
        const modal = document.getElementById('custom-modal');
        modal.style.display = "none";
        modal.style.position = "static";
      }

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;

        this.errorMessageWrapper =
          this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }
    }
  );
}
