<?php

namespace EmbedPress\Elementor\Widgets;


use \Elementor\Controls_Manager as Controls_Manager;
use \Elementor\Modules\DynamicTags\Module as TagsModule;
use \Elementor\Widget_Base as Widget_Base;
use \Elementor\Plugin;
use EmbedPress\Includes\Traits\Branding;
use EmbedPress\Includes\Classes\Helper;

( defined( 'ABSPATH' ) ) or die( "No direct script access allowed." );

class Embedpress_Calendar extends Widget_Base
{
	use Branding;
	protected $pro_class = '';
	protected $pro_text = '';
	public function get_name()
	{
		return 'embedpress_calendar';
	}

	public function get_title()
	{
		return esc_html__( 'EmbedPress Google Calendar', 'embedpress' );
	}

	public function get_categories()
	{
		return ['embedpress'];
	}

	public function get_custom_help_url()
	{
		return 'https://embedpress.com/docs/embed-google-calendar-in-wordpress/';
	}

	public function get_icon()
	{
		return 'eicon-calendar';
	}

	/**
	 * The public calendar is a plain iframe and needs no scripts. The private
	 * calendar (provided by EmbedPress Pro) adds its FullCalendar handles here.
	 *
	 * Filter `embedpress/calendar/elementor_script_depends` (string[] $handles):
	 * script handles the widget depends on. The callback must make sure the
	 * handles are registered.
	 */
    public function get_script_depends() {
        return (array) apply_filters('embedpress/calendar/elementor_script_depends', []);
    }

	/**
	 * Filter `embedpress/calendar/elementor_style_depends` (string[] $handles):
	 * style handles the widget depends on (see get_script_depends()).
	 */
	public function get_style_depends() {
        return (array) apply_filters('embedpress/calendar/elementor_style_depends', []);
	}

	/**
	 * Get widget keywords.
	 *
	 * Retrieve the list of keywords the widget belongs to.
	 *
	 * @return array Widget keywords.
	 * @since 2.5.5
	 * @access public
	 *
	 */
	public function get_keywords()
	{
		return ['embedpress', 'calendar', 'google', 'google calendar', 'google-calendar', 'ics', 'event', 'embedpress calendar'];
	}

	protected function register_controls()
	{
		$class = 'embedpress-pro-control not-active';
        $text =  '<sup class="embedpress-pro-label" style="color:red">' . __('Pro', 'embedpress') . '</sup>';
        $this->pro_class = apply_filters('embedpress/pro_class', $class);
        $this->pro_text = apply_filters('embedpress/pro_text', $text);
		
		/**
		 * EmbedPress Content Settings
		 */
		$this->start_controls_section(
			'embedpress_calendar_content_settings',
			[
				'label' => esc_html__( 'Content Settings', 'embedpress' ),
			]
		);

		$this->add_control(
			'embedpress_calendar_type',
			[
				'label'   => __( 'Calendar Type', 'embedpress' ),
				'type'    => Controls_Manager::SELECT,
				'default' => 'public',
				'options' => [
					'private' => __( 'Private', 'embedpress' ),
					'public'  => __( 'Public', 'embedpress' )
				],
			]
		);


		$this->add_control(
			'embedpress_public_cal_link',
			[

				'label'       => __( 'Public Calendar Link', 'embedpress' ),
				'type'        => Controls_Manager::TEXT,
				'dynamic'     => [
					'active' => true,
				],
				'placeholder' => __( 'Enter public calendar link', 'embedpress' ),
				'label_block' => true,
				'condition'   => [
					'embedpress_calendar_type' => 'public'
				],

			]
		);



		$this->add_responsive_control(
			'embedpress_elementor_calendar_width',
			[
				'label'     => __( 'Width', 'embedpress' ),
				'type'      => Controls_Manager::SLIDER,
				'separator' => 'before',
				'default'   => [
					'unit' => 'px',
					'size' => Helper::get_options_value('enableEmbedResizeWidth'),
				],
				'range'     => [
					'px' => [
						'min' => 6,
						'max' => 1200,
					],
				],
				'selectors' => [
					'{{WRAPPER}} .embedpress-calendar-embed iframe'  => 'width: {{SIZE}}{{UNIT}} !important; max-width: 100%',
				],
                'render_type' => 'template',
			]
		);

		$this->add_responsive_control(
			'embedpress_elementor_calendar_height',
			[
				'label'     => __( 'Height', 'embedpress' ),
				'type'      => Controls_Manager::SLIDER,
				'default'   => [
					'unit' => 'px',
					'size' => Helper::get_options_value('enableEmbedResizeHeight'),
				],
				'range'     => [
					'px' => [
						'min' => 6,
						'max' => 1000,
					],
				],
				'selectors' => [
					'{{WRAPPER}} .embedpress-calendar-embed iframe'               => 'height: {{SIZE}}{{UNIT}};',
				],
				'render_type' => 'template',

			]
		);

		$this->add_responsive_control(
			'embedpress_elementor_calendar_align',
			[
				'label'   => __( 'Alignment', 'embedpress' ),
				'type'    => Controls_Manager::CHOOSE,
				'options' => [
					'left'   => [
						'title' => __( 'Left', 'embedpress' ),
						'icon'  => 'eicon-text-align-left',
					],
					'center' => [
						'title' => __( 'Center', 'embedpress' ),
						'icon'  => 'eicon-text-align-center',
					],
					'right'  => [
						'title' => __( 'Right', 'embedpress' ),
						'icon'  => 'eicon-text-align-right',
					]
				],
				'prefix_class' => 'elementor%s-align-',
				'default' => '',
			]
		);

		// Follow the global "Powered By EmbedPress" setting (off on fresh
		// installs, WP.org Guideline 10) like the PDF and Document widgets.
		$g_settings = (array) get_option( EMBEDPRESS_PLG_NAME, [] );
		$powered_by_default = isset( $g_settings['embedpress_document_powered_by'] ) && 'yes' === $g_settings['embedpress_document_powered_by'] ? 'yes' : 'no';

		$this->add_control(
			'embedpress_calendar_powered_by',
			[
				'label'        => __( 'Powered By', 'embedpress' ),
				'type'         => Controls_Manager::SWITCHER,
				'label_on'     => __( 'Show', 'embedpress' ),
				'label_off'    => __( 'Hide', 'embedpress' ),
				'return_value' => 'yes',
				'default'      => apply_filters( 'embedpress_calendar_powered_by_control', $powered_by_default ),
			]
		);

		$this->init_branding_controls( 'calendar');

		// Get global lazy load setting
		$g_settings = get_option(EMBEDPRESS_PLG_NAME, []);
		$lazy_load_default = isset($g_settings['g_lazyload']) && $g_settings['g_lazyload'] == 1 ? 'yes' : '';

		$this->add_control(
			'enable_lazy_load',
			[
				'label' => sprintf(__('Enable Lazy Loading %s', 'embedpress'), $this->pro_text),
				'type' => \Elementor\Controls_Manager::SWITCHER,
				'label_on' => __('Yes', 'embedpress'),
				'label_off' => __('No', 'embedpress'),
				'return_value' => 'yes',
				'default' => $lazy_load_default,
				'separator' => 'before',
				'description' => __('Load iframe only when it enters the viewport for better performance', 'embedpress'),
				'classes' => $this->pro_class,
			]
		);

		$this->end_controls_section();

	}

	public function isGoogleCalendar($url) {
		// Allow http(s), optional `www.`, and the `u/<n>/` account segment that
		// Google injects when copying the embed code while signed in.
		$pattern = '~^https?://(?:www\.)?calendar\.google\.com/calendar/(?:u/\d+/)?embed\?.*$~i';
		return preg_match($pattern, $url);
	}

	protected function render()
	{
		$settings = $this->get_settings();
		$id = 'embedpress-calendar-' .esc_attr( $this->get_id());
		$dimension = "width: " . esc_attr($settings['embedpress_elementor_calendar_width']['size']) . "px; height: " . esc_attr($settings['embedpress_elementor_calendar_height']['size']) . "px";

		if(!empty($settings['embedpress_public_cal_link']) && !$this->isGoogleCalendar($settings['embedpress_public_cal_link'])) {
			echo esc_html__('Invalid Calendar URL.');
			return;
		}

		$this->add_render_attribute('embedpress-calendar-render', [
			'class' => ['embedpress-embed-calendar-calendar', esc_attr($id)],
			'data-emid' => esc_attr($id)
		]);
		$this->add_render_attribute('embedpress-calendar', [
			'class' => ['embedpress-calendar-embed', 'ep-cal-' . md5($id), 'ose-calendar']
		]);
		$is_private_cal = (!empty($settings['embedpress_calendar_type']) && 'private' === $settings['embedpress_calendar_type']);
		$is_editor_view = Plugin::$instance->editor->is_edit_mode();
		?>
		<div <?php echo $this->get_render_attribute_string('embedpress-calendar'); ?> style="<?php echo esc_attr($dimension); ?>; max-width:100%; display: inline-block" data-embed-type="<?php echo esc_attr(Helper::get_provider_name($settings['embedpress_public_cal_link'])); ?>">
			<?php
			do_action('embedpress_calendar_after_embed', $settings, $id, $this);
			?>
			<div <?php echo $this->get_render_attribute_string('embedpress-calendar-render'); ?>>
				<?php if (!empty($settings['embedpress_public_cal_link']) && !empty($settings['embedpress_calendar_type']) && 'public' === $settings['embedpress_calendar_type']) {
					$calendar_iframe = '<iframe title="" style="' . esc_attr($dimension) . '; max-width:100%; display: inline-block" src="' . esc_url($settings['embedpress_public_cal_link']) . '" frameborder="0"></iframe>';
					/** This filter is documented in EmbedPress/Elementor/Widgets/Embedpress_Pdf.php ($context also carries 'dimension'). */
					echo apply_filters('embedpress/lazy_load/html', $calendar_iframe, $settings, ['surface' => 'elementor-calendar', 'is_editor' => (bool) $is_editor_view, 'dimension' => $dimension]);
				} else {
					if ($is_editor_view && empty($settings['embedpress_public_cal_link']) && !$is_private_cal) { ?>
						<p><?php esc_html_e('Please paste your public google calendar link.', 'embedpress'); ?></p>
					<?php }

					// The private calendar is provided by EmbedPress Pro through the
					// neutral `embedpress_google_helper_shortcode` action; with
					// nothing (compatible) hooked, show the upsell notice instead.
					// Only a private calendar fires the action: a public calendar
					// without a link must not reach it (Pro <= 3.9.1 fatals there).
					if ($is_private_cal) {
						if (\EmbedPress\Includes\Classes\Helper::has_private_calendar_renderer()) {
							// Render the private calendar in both the editor and the frontend.
							do_action('embedpress_google_helper_shortcode', 10);
						} else { ?>
							<p><?php esc_html_e('You need EmbedPress Pro to display Private Calendar Data.', 'embedpress'); ?></p>
						<?php }
					}

				} ?>
			</div>
			<?php
			if ($settings['embedpress_calendar_powered_by'] === 'yes') {
				printf('<p class="embedpress-el-powered">%s</p>', esc_html__('Powered By EmbedPress', 'embedpress'));
			}
			?>
		</div>
		<?php
	}


}
