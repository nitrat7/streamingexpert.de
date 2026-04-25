document.addEventListener('DOMContentLoaded', () => {
    const yearEl = document.getElementById('year');
    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }

    const portrait = document.querySelector('.portrait');
    if (portrait) {
        if (portrait.complete) {
            portrait.classList.add('loaded');
        } else {
            portrait.addEventListener('load', () => portrait.classList.add('loaded'));
        }
    }
});
