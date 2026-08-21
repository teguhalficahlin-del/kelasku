import { test, expect } from '@playwright/test';
import { loginAdmin, envHilang } from '../fixtures/auth.js';

const WAJIB = ['TEST_BASE_URL', 'TEST_ADMIN_EMAIL', 'TEST_ADMIN_PASSWORD'];

test.describe('Portal Admin', () => {
  test.beforeEach(async ({ page }) => {
    const hilang = envHilang(...WAJIB);
    test.skip(hilang.length > 0, 'Kredensial belum diisi: ' + hilang.join(', '));
    await loginAdmin(page);
  });

  test('login berhasil dan dashboard tampil', async ({ page }) => {
    await expect(page.locator('#dashboard-view')).toBeVisible();
    await expect(page.locator('#login-view')).toBeHidden();
  });

  test('daftar guru tampil', async ({ page }) => {
    await expect(page.locator('#guru-list .guru-card').first()).toBeVisible({ timeout: 20000 });
  });

  // Regresi FIX-4: tombolnya pernah tanpa style sama sekali sehingga tampil
  // seperti tombol bawaan browser, tak terbedakan dari aksi lain.
  test('tombol Reset Password ada dan berwarna indigo', async ({ page }) => {
    await expect(page.locator('#guru-list .guru-card').first()).toBeVisible({ timeout: 20000 });

    const tombol = page.locator('#guru-list .btn-reset-pw').first();
    await expect(tombol).toBeVisible();
    await expect(tombol).toHaveText('Reset Password');

    const warna = await tombol.evaluate(el => {
      const c = getComputedStyle(el);
      return { bg: c.backgroundColor, fg: c.color, border: c.borderColor };
    });

    // Nilai persis dari .btn-reset-pw di admin.css. Dicocokkan tepat, bukan
    // sekadar "bukan transparan": tombol tanpa style pun punya latar abu-abu
    // bawaan browser, jadi pemeriksaan longgar akan lolos padahal bug-nya ada.
    expect(warna.bg).toBe('rgba(99, 102, 241, 0.12)');
    expect(warna.fg).toBe('rgb(165, 180, 252)');
    expect(warna.border).toBe('rgba(99, 102, 241, 0.35)');
  });
});
