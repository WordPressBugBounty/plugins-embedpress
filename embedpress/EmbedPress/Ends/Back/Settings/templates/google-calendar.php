<?php
/*
 * Google Calendar Settings page
 * All undefined vars comes from 'render_settings_page' method
 *
 * Public Google Calendars are embedded with a plain iframe and need no
 * settings. The private calendar (Google OAuth client, cache time, calendar
 * selection) is provided by EmbedPress Pro, which renders its settings form
 * through the `embedpress/settings/google_calendar_tab` action:
 *
 *     do_action( 'embedpress/settings/google_calendar_tab', string $nonce_field );
 *
 * When nothing is hooked, free shows a locked preview of those settings.
 *  */

if ( has_action( 'embedpress/settings/google_calendar_tab' ) ) {
	do_action( 'embedpress/settings/google_calendar_tab', $nonce_field );
	return;
}

$epgc_redirect_uri = admin_url( 'admin.php?page=embedpress&page_type=google-calendar' );
$epgc_pro_badge    = ' <span class="isPro">PRO</span>';

?>

<div class="embedpress__settings embedpress-gcalendar-settings background__white radius-25 p40">
	<div class="embedpress-gcalendar-settings__header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
		<h3 style="margin:0;"><?php esc_html_e( "Google Calendar Settings", "embedpress" ); ?></h3>
		<a href="https://embedpress.com/docs/embed-google-calendar-in-wordpress/" target="_blank" rel="noopener noreferrer" class="embedpress-gcalendar-doc-link" style="display:inline-flex;align-items:center;gap:4px;font-size:13px;color:#1a73e8;text-decoration:none;line-height:1;">
			<?php esc_html_e( 'Documentation', 'embedpress' ); ?>
			<span aria-hidden="true">&rarr;</span>
		</a>
	</div>
	<p><?php esc_html_e( 'Public Google Calendars can be embedded without any settings. Connecting a Google account to show private calendars is available in EmbedPress Pro.', 'embedpress' ); ?></p>
	<div class="embedpress__settings__form embedpress-gcalendar-settings__form">
		<div class="embedpress-settings-form">
			<div class="form__group">
				<label for="epgc_client_id" class="form__label"><?php esc_html_e( 'Client ID', 'embedpress' ); echo $epgc_pro_badge; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static markup ?></label>
				<div class="form__control__wrap isPro">
					<input type="text" id="epgc_client_id" class="form__control" value="" placeholder="xxxxxxxx-xxxxxxxxxxxx.apps.googleusercontent.com" disabled />
					<p><?php esc_html_e( 'From your Google Cloud Console OAuth 2.0 Client ID.', 'embedpress' ); ?></p>
				</div>
				<?php include EMBEDPRESS_SETTINGS_PATH . 'templates/partials/alert-pro.php'; ?>
			</div>

			<div class="form__group">
				<label for="epgc_client_secret_value" class="form__label"><?php esc_html_e( 'Client Secret', 'embedpress' ); echo $epgc_pro_badge; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static markup ?></label>
				<div class="form__control__wrap isPro">
					<input type="password" id="epgc_client_secret_value" class="form__control" value="" placeholder="GOCSPX-..." disabled />
					<p><?php esc_html_e( 'From the same OAuth 2.0 Client. Stored in the WordPress options table.', 'embedpress' ); ?></p>
				</div>
				<?php include EMBEDPRESS_SETTINGS_PATH . 'templates/partials/alert-pro.php'; ?>
			</div>

			<div class="form__group">
				<label class="form__label"><?php esc_html_e( 'Authorized Redirect URI', 'embedpress' ); echo $epgc_pro_badge; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static markup ?></label>
				<div class="form__control__wrap isPro">
					<input type="text" readonly value="<?php echo esc_attr( $epgc_redirect_uri ); ?>" class="form__control" disabled />
				</div>
				<?php include EMBEDPRESS_SETTINGS_PATH . 'templates/partials/alert-pro.php'; ?>
			</div>

			<div class="form__group">
				<label for="epgc_cache_time" class="form__label"><?php esc_html_e( "Caching time (in Minutes)", "embedpress" ); echo $epgc_pro_badge; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static markup ?></label>
				<div class="form__control__wrap isPro">
					<input type="number" id="epgc_cache_time" class="form__control" value="0" disabled />
					<p><?php esc_html_e( 'How long do you want to cache the data? Set it 0 to disable caching', 'embedpress' ); ?></p>
				</div>
				<?php include EMBEDPRESS_SETTINGS_PATH . 'templates/partials/alert-pro.php'; ?>
			</div>

			<h2><?php esc_html_e( 'Calendars', 'embedpress' ); ?></h2>
			<div class="form__group">
				<label class="form__label"><?php esc_html_e( "Select calendars to show", "embedpress" ); echo $epgc_pro_badge; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static markup ?></label>
				<div class="form__control__wrap isPro">
					<p><?php esc_html_e( 'No calendar was found', 'embedpress' ); ?></p>
				</div>
				<?php include EMBEDPRESS_SETTINGS_PATH . 'templates/partials/alert-pro.php'; ?>
			</div>

			<a href="https://wpdeveloper.com/in/upgrade-embedpress" target="_blank" rel="noopener noreferrer" class="button button__themeColor radius-10"><?php esc_html_e( 'Upgrade to Pro', 'embedpress' ); ?></a>
		</div>
	</div>
</div>
