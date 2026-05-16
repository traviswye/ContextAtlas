class ApplicationController < ActionController::Base
  before_action :authenticate_user!

  protected

  def authenticate_user!
    # placeholder
  end

  def current_user
    @current_user
  end
end
