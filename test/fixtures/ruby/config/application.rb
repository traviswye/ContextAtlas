require_relative 'boot'
require 'rails/all'

Bundler.require(*Rails.groups)

module RubyProbe
  class Application < Rails::Application
    config.load_defaults 8.0
    config.eager_load = false
  end
end
