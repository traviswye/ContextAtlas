module DynamicMethods
  STATUSES = %i[active inactive pending suspended].freeze

  STATUSES.each do |status|
    define_method("#{status}?") do
      current_status == status
    end
  end

  def current_status
    @status || :pending
  end
end
